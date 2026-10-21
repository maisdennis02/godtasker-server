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

// Four welcome tasks, sent one at a time: completing step N delivers step N+1
// (TaskConfirmController), so each new task is a reason to come back. Language
// follows the locale the client sent at sign-up: pt* → pt, anything else → en,
// matching the app UI and the push copy.
//
// 1. a one-minute win, 2. a three-day photo challenge (first contact with the
// proof-photo flow, one step per day), 3. a checklist worth using for real,
// 4. the delegation loop with another person. Steps 2 and 3 carry their own
// window; everything else defaults to confirmPhoto false / dueDays 3.
export const WELCOME_STEPS = 4;
const DEFAULT_DUE_DAYS = 3;

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
      name: 'Desafio de 3 dias: uma foto do seu dia',
      description: `Uma foto por dia, três dias seguidos. Marque um passo por dia e conclua com uma foto de prova. ${SUPPORT.pt}`,
      points: 30,
      confirmPhoto: true,
      dueDays: 3,
      steps: [
        'Dia 1: uma foto do seu café ou da vista da janela',
        'Dia 2: uma foto de algo que você terminou hoje',
        'Dia 3: o canto mais bagunçado da casa, antes e depois de 10 min de arrumação',
      ],
    },
    {
      name: 'Reset de domingo (30 min)',
      description: `Um checklist pronto para usar de verdade. Faça uma vez, depois deixe do seu jeito. ${SUPPORT.pt}`,
      points: 20,
      dueDays: 7,
      steps: [
        'Limpe sua mesa',
        'Anote as 3 coisas que importam nesta semana',
        'Separe a roupa de amanhã',
        '10 minutos zerando mensagens e e-mails',
        'Leve o lixo para fora',
        'Crie sua própria versão desta lista para a semana que vem',
      ],
    },
    {
      name: 'Traga alguém',
      description: `Tarefas ficam melhores em dupla. ${SUPPORT.pt}`,
      points: 40,
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
      name: '3-day challenge: a photo of your day',
      description: `One photo a day, three days in a row. Tick a step each day and finish with a photo as proof. ${SUPPORT.en}`,
      points: 30,
      confirmPhoto: true,
      dueDays: 3,
      steps: [
        'Day 1: a photo of your coffee or the view from your window',
        'Day 2: a photo of something you finished today',
        'Day 3: the messiest spot at home, before and after 10 minutes of tidying',
      ],
    },
    {
      name: 'Sunday reset (30 min)',
      description: `A ready-made checklist you can actually use. Do it once, then make it yours. ${SUPPORT.en}`,
      points: 20,
      dueDays: 7,
      steps: [
        'Clear your desk or table',
        'Write down the 3 things that matter this week',
        "Lay out tomorrow's clothes",
        '10 minutes clearing messages and inbox',
        'Take out the trash',
        'Create your own version of this list for next week',
      ],
    },
    {
      name: 'Bring someone in',
      description: `Tasks are better with someone else. ${SUPPORT.en}`,
      points: 40,
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
  const copy = COPY[lang][index];
  return { confirmPhoto: false, dueDays: DEFAULT_DUE_DAYS, ...copy };
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
      confirm_photo: copy.confirmPhoto,
      approval_required: false,
      start_date: new Date(),
      due_date: addDays(new Date(), copy.dueDays),
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
