import { Router } from 'express';

import authMiddleware from './app/middlewares/auth';
import { authLimiter } from './app/middlewares/rateLimit';

import DashboardController from './app/controllers/DashboardController';
import FileController from './app/controllers/FileController';

import MessageController from './app/controllers/Message/MessageController';
import MessageUserController from './app/controllers/Message/MessageUserController';
import MessageWorkerController from './app/controllers/Message/MessageWorkerController';
import MessageNotificationController from './app/controllers/Message/MessageNotificationController';
import ChatMessageController from './app/controllers/Message/ChatMessageController';

import OfferingController from './app/controllers/OfferingController';
import SessionController from './app/controllers/SessionController';
import SignatureController from './app/controllers/SignatureController';

import TaskCancelController from './app/controllers/Task/TaskCancelController';
import TaskConfirmController from './app/controllers/Task/TaskConfirmController';
import TaskController from './app/controllers/Task/TaskController';
import TaskDetailController from './app/controllers/Task/TaskDetailController';
import TaskReviveController from './app/controllers/Task/TaskReviveController';
import TaskStatusController from './app/controllers/Task/TaskStatusController';
import TaskUserCanceledController from './app/controllers/Task/TaskUserCanceledController';
import TaskUserCountController from './app/controllers/Task/TaskUserCountController';
import TaskUserFinishedController from './app/controllers/Task/TaskUserFinishedController';
import TaskUserUnfinishedController from './app/controllers/Task/TaskUserUnfinishedController';
import TaskWorkerNotificationController from './app/controllers/Task/TaskWorkerNotificationController';
import TaskWorkerSubtaskNotificationController from './app/controllers/Task/TaskWorkerSubtaskNotificationController';
import TaskWorkerFinishedController from './app/controllers/Task/TaskWorkerFinishedController';
import TaskWorkerUnfinishedController from './app/controllers/Task/TaskWorkerUnfinishedController';
import TaskWorkerCanceledController from './app/controllers/Task/TaskWorkerCanceledController';
import TaskWorkerCountController from './app/controllers/Task/TaskWorkerCountController';

import UserController from './app/controllers/User/UserController';
import UserBlockController from './app/controllers/User/UserBlockController';
import UserUnblockController from './app/controllers/User/UserUnblockController';
import UserFlagController from './app/controllers/User/UserFlagController';
import UserFollowingController from './app/controllers/User/UserFollowingController';
import UserFollowingCountController from './app/controllers/User/UserFollowingCountController';
import UserFollowingIndividualController from './app/controllers/User/UserFollowingIndividualController';
import UserFollowersController from './app/controllers/User/UserFollowersController';
import UserListIndividualController from './app/controllers/User/UserListIndividualController';
import UserNotificationController from './app/controllers/User/UserNotificationController';
import UserPointsController from './app/controllers/User/UserPointsController';
import UserUpdateNoPhotoController from './app/controllers/User/UserUpdateNoPhotoController';

const routes = new Router();

// ─── Health check (public; used by the host's uptime/health probe) ───────────
routes.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── Public routes (rate-limited against credential stuffing) ────────────────
routes.post('/sessions', authLimiter, SessionController.store);
routes.post('/users', authLimiter, UserController.store);

// ─── Auth gate ──────────────────────────────────────────────────────────────
routes.use(authMiddleware);

// ─── Dashboard ──────────────────────────────────────────────────────────────
routes.get('/dashboard/:id', DashboardController.index);

// ─── Files ──────────────────────────────────────────────────────────────────
routes.post('/files', FileController.store);
routes.get('/files', FileController.index);

// ─── Messages ───────────────────────────────────────────────────────────────
routes.post('/messages', MessageController.store);
routes.post('/messages/notification/:id', MessageNotificationController.store);
routes.get('/messages', MessageController.index);
routes.get('/messages/user', MessageUserController.index);
routes.get('/messages/worker', MessageWorkerController.index);
// Real-time chat (threaded message bodies on top of the conversation header)
routes.post('/messages/start', ChatMessageController.start);
routes.get('/messages/:chatId/thread', ChatMessageController.index);
routes.post('/messages/:chatId/send', ChatMessageController.store);
routes.put('/messages/:id', MessageController.update);
routes.delete('/messages/:id', MessageController.delete);

// ─── Offerings (profile task offerings; request spawns a task) ───────────────
routes.post('/offerings', OfferingController.store);
routes.get('/offerings', OfferingController.index);
routes.post('/offerings/:id/request', OfferingController.request);
routes.put('/offerings/:id', OfferingController.update);
routes.delete('/offerings/:id', OfferingController.delete);

// ─── Signatures ─────────────────────────────────────────────────────────────
routes.post('/signatures', SignatureController.store);
routes.get('/signatures', SignatureController.index);

// ─── Tasks ──────────────────────────────────────────────────────────────────
routes.post('/tasks', TaskController.store);
routes.get('/tasks', TaskController.index);
// Received (I am the assignee)
routes.get('/tasks/finished', TaskWorkerFinishedController.index);
routes.get('/tasks/unfinished', TaskWorkerUnfinishedController.index);
routes.get('/tasks/canceled', TaskWorkerCanceledController.index);
routes.get('/tasks/count', TaskWorkerCountController.index);
routes.get('/tasks/:id/details', TaskDetailController.index);
// Sent (I am the requester)
routes.get('/tasks/user/canceled', TaskUserCanceledController.index);
routes.get('/tasks/user/unfinished', TaskUserUnfinishedController.index);
routes.get('/tasks/user/finished', TaskUserFinishedController.index);
routes.get('/tasks/user/count', TaskUserCountController.index);
routes.put('/tasks/confirm/:id', TaskConfirmController.update);
routes.put('/tasks/:id', TaskController.update);
routes.put(
  '/tasks/:id/notification/worker',
  TaskWorkerNotificationController.update
);
routes.put(
  '/tasks/:id/notification/worker/subtask',
  TaskWorkerSubtaskNotificationController.update
);
routes.put('/tasks/:id/cancel', TaskCancelController.update);
routes.put('/tasks/:id/revive', TaskReviveController.update);
routes.put('/tasks/:id/status', TaskStatusController.update);
routes.delete('/tasks/:id', TaskController.delete);

// ─── Users ──────────────────────────────────────────────────────────────────
routes.get('/users', UserController.index);
routes.post('/users/following', UserFollowingController.store);
routes.get('/users/block', UserBlockController.index);
routes.get('/users/flag', UserFlagController.index);
routes.get('/users/following', UserFollowingController.index);
routes.get('/users/following/count', UserFollowingCountController.index);
routes.get(
  '/users/following/individual',
  UserFollowingIndividualController.index
);
routes.get('/users/followers', UserFollowersController.index);
routes.get('/users/followers/count', UserFollowersController.count);
routes.get('/users/:id', UserListIndividualController.index);
routes.put('/users', UserController.update);
routes.put('/users/block', UserBlockController.update);
routes.put('/users/flag', UserFlagController.update);
routes.put('/users/unblock', UserUnblockController.update);
routes.put('/users/following', UserFollowingController.update);
routes.put('/users/no-photo', UserUpdateNoPhotoController.update);
routes.put('/users/notifications/:id', UserNotificationController.update);
routes.put('/users/points/:id', UserPointsController.update);
routes.delete('/users/:id', UserController.delete);

export default routes;
