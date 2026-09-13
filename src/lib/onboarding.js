import { addDays } from 'date-fns';

import User from '../app/models/User';
import Task from '../app/models/Task';
import logger from './logger';
import { subtaskProgress } from '../app/utils/subtasks';
import { emitTaskChanged } from './taskEvents';

// Onboarding: every new account gets a welcome task from the "LalaTask" system
// account (scripts/ensure-onboarding-account.js creates it). It doubles as a
// guided tour and as the first engagement signal for the Play closed test.
// Best-effort — sign-up must never fail because of it.
export const ONBOARDING_SENDER_EMAIL =
  process.env.ONBOARDING_SENDER_EMAIL || 'onboarding@lalatask.com';

let senderId = null;

export async function getOnboardingSender() {
  if (senderId) return User.findByPk(senderId);
  const sender = await User.findOne({ where: { email: ONBOARDING_SENDER_EMAIL } });
  if (sender) senderId = sender.id;
  return sender;
}

// Language is decided by the locale the client sends at sign-up (device/browser
// language). Unknown → bilingual, so nobody gets the wrong language only.
const COPY = {
  pt: {
    name: 'Bem-vindo ao LalaTask 👋',
    description:
      'Obrigado por testar o LalaTask! Marque os passos abaixo e depois conclua a tarefa. Algo confuso ou quebrado? Escreva para support@lalatask.com.',
    steps: [
      'Marque esta caixa',
      'Toque em Iniciar nesta tarefa',
      'Abra o Perfil e coloque uma foto',
      'Envie uma tarefa sua para alguém',
    ],
  },
  en: {
    name: 'Welcome to LalaTask 👋',
    description:
      'Thanks for testing LalaTask! Tick the steps below, then mark the task done. Anything confusing or broken? Email support@lalatask.com.',
    steps: [
      'Tick this box',
      'Tap Start on this task',
      'Open Profile and set a photo',
      'Send someone a task of your own',
    ],
  },
};
COPY.both = {
  name: `${COPY.en.name} / ${COPY.pt.name}`,
  description: `${COPY.en.description}\n\n${COPY.pt.description}`,
  steps: COPY.en.steps.map((s, i) => `${s} / ${COPY.pt.steps[i]}`),
};

export function welcomeCopy(locale) {
  const lang = String(locale || '').toLowerCase();
  if (lang.startsWith('pt')) return COPY.pt;
  if (lang.startsWith('en')) return COPY.en;
  return COPY.both;
}

export async function sendWelcomeTask(user, locale) {
  try {
    const sender = await getOnboardingSender();
    if (!sender) {
      logger.warn({ email: ONBOARDING_SENDER_EMAIL }, '[onboarding] sender account missing');
      return null;
    }
    if (sender.id === user.id) return null;
    const copy = welcomeCopy(locale || user.locale);
    const sub_task_list = copy.steps.map((description, order) => ({
      description,
      complete: false,
      order,
    }));
    const task = await Task.create({
      requester_id: sender.id,
      requester_email: sender.email,
      assignee_id: user.id,
      assignee_email: user.email,
      name: copy.name,
      description: copy.description,
      sub_task_list,
      status_bar: subtaskProgress(sub_task_list),
      points: 0,
      confirm_photo: false,
      approval_required: false,
      start_date: new Date(),
      due_date: addDays(new Date(), 3),
    });
    // No push here: the device only registers its token after the first
    // login, so the task simply waits on the first screen.
    emitTaskChanged(task, 'created');
    logger.info({ userId: user.id, taskId: task.id }, '[onboarding] welcome task sent');
    return task;
  } catch (err) {
    logger.warn({ err: err.message, userId: user.id }, '[onboarding] welcome task failed');
    return null;
  }
}
