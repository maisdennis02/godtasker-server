import { format } from 'date-fns';
import { enUS, ptBR } from 'date-fns/locale';

// Push notification copy, localized for the RECIPIENT. The mobile app stores
// the device locale on the user (`users.locale`, sent alongside the FCM token),
// so the server — not the sender's phone — picks the language. Anything not
// Portuguese falls back to English.
const STRINGS = {
  en: {
    newTask: 'New task',
    due: 'due',
    approvalRequested: 'Approval requested',
    awaitingApproval: ({ name }) => `"${name}" is awaiting your approval`,
    taskCompleted: 'Task completed',
    markedDone: ({ name }) => `"${name}" was marked done`,
    approved: ({ name }) => `"${name}" was approved`,
    subtaskTitle: ({ name }) => `Subtask: ${name}:`,
    subtaskDone: ({ who, desc }) => `${who} completed · ${desc}`,
    subtaskReopened: ({ who, desc }) => `${who} reopened · ${desc}`,
    taskStarted: ({ who, name }) => `${who} started "${name}"`,
    taskUpdated: ({ name }) => `${name} updated`,
    offeringRequested: ({ name }) => `requested: ${name}`,
    startedFollowing: 'started following you',
    newMessage: 'New message',
    approvalOverdue: ({ name }) =>
      `"${name}" has been awaiting your approval for 3 days`,
  },
  pt: {
    newTask: 'Nova tarefa',
    due: 'prazo',
    approvalRequested: 'Aprovação solicitada',
    awaitingApproval: ({ name }) => `"${name}" aguarda sua aprovação`,
    taskCompleted: 'Tarefa concluída',
    markedDone: ({ name }) => `"${name}" foi marcada como concluída`,
    approved: ({ name }) => `"${name}" foi aprovada`,
    subtaskTitle: ({ name }) => `Subtarefa: ${name}:`,
    subtaskDone: ({ who, desc }) => `${who} concluiu · ${desc}`,
    subtaskReopened: ({ who, desc }) => `${who} reabriu · ${desc}`,
    taskStarted: ({ who, name }) => `${who} iniciou "${name}"`,
    taskUpdated: ({ name }) => `${name} atualizada`,
    offeringRequested: ({ name }) => `solicitou: ${name}`,
    startedFollowing: 'começou a seguir você',
    newMessage: 'Nova mensagem',
    approvalOverdue: ({ name }) =>
      `"${name}" aguarda sua aprovação há 3 dias`,
  },
};

export function langOf(user) {
  const locale = (user && user.locale) || '';
  return locale.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export default function pushText(user, key, params = {}) {
  const entry = STRINGS[langOf(user)][key] ?? STRINGS.en[key];
  return typeof entry === 'function' ? entry(params) : entry;
}

// Short date for the "new task … due <date>" push, in the recipient's format.
export function pushDate(user, date) {
  return langOf(user) === 'pt'
    ? format(date, 'dd/MM/yyyy', { locale: ptBR })
    : format(date, "MMM'/'dd'/'yyyy", { locale: enUS });
}
