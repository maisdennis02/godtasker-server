import { addDays } from 'date-fns';
import firebaseAdmin from 'firebase-admin';

import User from '../app/models/User';
import Task from '../app/models/Task';
import logger from './logger';
import pushText from './pushText';
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

// Three welcome tasks, sent one at a time: completing step N delivers step N+1
// (TaskConfirmController), so each new task is a reason to come back. Language
// follows the locale the client sent at sign-up: pt* → pt, anything else → en,
// matching the app UI and the push copy.
export const WELCOME_STEPS = 3;

const SUPPORT = {
  pt: 'Algo confuso ou quebrado? Escreva para support@lalatask.com.',
  en: 'Anything confusing or broken? Email support@lalatask.com.',
};

const COPY = {
  pt: [
    {
      name: 'Sua primeira tarefa em 1 minuto',
      description: `Bem-vindo ao LalaTask! Faça os passos abaixo e ganhe seus primeiros pontos. ${SUPPORT.pt}`,
      points: 10,
      steps: [
        'Toque em Iniciar',
        'Marque este passo',
        'Conclua a tarefa e ganhe seus primeiros pontos',
      ],
    },
    {
      name: 'Organize algo seu',
      description: `O LalaTask também serve para o seu dia a dia. ${SUPPORT.pt}`,
      points: 20,
      steps: [
        'Crie uma tarefa para você mesmo (ex.: "Comprar pão")',
        'Adicione passos e um prazo a ela',
        'Conclua essa tarefa',
      ],
    },
    {
      name: 'Traga alguém',
      description: `Tarefas ficam melhores em dupla. ${SUPPORT.pt}`,
      points: 30,
      steps: [
        'Siga uma pessoa',
        'Mande uma tarefa para ela',
        'Converse com ela no chat',
        'Veja o feed de Ofertas e publique uma oferta sua',
      ],
    },
  ],
  en: [
    {
      name: 'Your first task in 1 minute',
      description: `Welcome to LalaTask! Do the steps below and earn your first points. ${SUPPORT.en}`,
      points: 10,
      steps: [
        'Tap Start',
        'Tick this step',
        'Complete the task and earn your first points',
      ],
    },
    {
      name: 'Organize something of yours',
      description: `LalaTask works for your own day-to-day too. ${SUPPORT.en}`,
      points: 20,
      steps: [
        'Create a task for yourself (e.g. "Buy bread")',
        'Give it steps and a due date',
        'Complete that task',
      ],
    },
    {
      name: 'Bring someone in',
      description: `Tasks are better with someone else. ${SUPPORT.en}`,
      points: 30,
      steps: [
        'Follow a person',
        'Send them a task',
        'Chat with them',
        'Browse Offerings and post an offer of your own',
      ],
    },
  ],
};

export function welcomeCopy(locale, step = 1) {
  const lang = String(locale || '').toLowerCase().startsWith('pt') ? 'pt' : 'en';
  const index = Math.min(Math.max(Number(step) || 1, 1), WELCOME_STEPS) - 1;
  return COPY[lang][index];
}

export async function sendWelcomeTask(user, locale, step = 1) {
  try {
    const sender = await getOnboardingSender();
    if (!sender) {
      logger.warn({ email: ONBOARDING_SENDER_EMAIL }, '[onboarding] sender account missing');
      return null;
    }
    if (sender.id === user.id) return null;
    // One task per step, however often this is called.
    const existing = await Task.findOne({
      where: { assignee_id: user.id, onboarding_step: step },
    });
    if (existing) return null;
    const copy = welcomeCopy(locale || user.locale, step);
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
      points: copy.points,
      onboarding_step: step,
      confirm_photo: false,
      approval_required: false,
      start_date: new Date(),
      due_date: addDays(new Date(), 3),
    });
    emitTaskChanged(task, 'created');
    // Step 1 is created at sign-up, before the device has a push token; later
    // steps arrive while the person is away, so they get the "New task" push.
    if (step > 1 && user.notification_token) {
      const body = `${pushText(user, 'newTask')}: ${copy.name}`;
      firebaseAdmin
        .messaging()
        .send({
          notification: { title: sender.user_name, body },
          data: { channelId: 'godtaskerChannel01', title: sender.user_name, message: body },
          android: { notification: { sound: 'default' } },
          apns: { payload: { aps: { sound: 'default' } } },
          token: user.notification_token,
        })
        .catch(error => logger.error({ err: error }, 'FCM send failed'));
    }
    logger.info({ userId: user.id, taskId: task.id, step }, '[onboarding] welcome task sent');
    return task;
  } catch (err) {
    logger.warn({ err: err.message, userId: user.id }, '[onboarding] welcome task failed');
    return null;
  }
}
