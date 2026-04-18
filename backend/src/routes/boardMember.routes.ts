import { Router } from 'express';
import * as boardMemberController from '../controllers/boardMember.controller.js';

export const boardMemberRouter = Router();

boardMemberRouter.get('/:boardId/members', boardMemberController.listMembers);
boardMemberRouter.post('/:boardId/members', boardMemberController.addMember);
boardMemberRouter.patch('/:boardId/members/:userId', boardMemberController.updateMemberRole);
boardMemberRouter.delete('/:boardId/members/:userId', boardMemberController.removeMember);
