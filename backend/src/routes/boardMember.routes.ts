import { Router } from 'express';
import * as boardMemberController from '../controllers/boardMember.controller.js';

export const boardMemberRouter = Router();

boardMemberRouter.get('/:boardId/members', boardMemberController.listMembers);
boardMemberRouter.get('/:boardId/participants', boardMemberController.listParticipants);
boardMemberRouter.post('/:boardId/members', boardMemberController.addMember);
boardMemberRouter.post('/:boardId/invite', boardMemberController.inviteByEmail);
boardMemberRouter.patch('/:boardId/members/:userId', boardMemberController.updateMemberRole);
boardMemberRouter.delete('/:boardId/members/:userId', boardMemberController.removeMember);
