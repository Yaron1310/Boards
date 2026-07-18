import { Router } from 'express';
import * as boardMemberController from '../controllers/boardMember.controller.js';
import * as boardViewInviteController from '../controllers/boardViewInvite.controller.js';

export const boardMemberRouter = Router();

boardMemberRouter.get('/:boardId/members', boardMemberController.listMembers);
boardMemberRouter.get('/:boardId/participants', boardMemberController.listParticipants);
boardMemberRouter.post('/:boardId/members', boardMemberController.addMember);
boardMemberRouter.post('/:boardId/invite', boardMemberController.inviteByEmail);
boardMemberRouter.patch('/:boardId/members/:userId', boardMemberController.updateMemberRole);
boardMemberRouter.delete('/:boardId/members/:userId', boardMemberController.removeMember);

boardMemberRouter.get('/:boardId/view-invites', boardViewInviteController.listInvites);
boardMemberRouter.post('/:boardId/view-invites', boardViewInviteController.createInvite);
boardMemberRouter.delete('/:boardId/view-invites/:inviteId', boardViewInviteController.revokeInvite);
