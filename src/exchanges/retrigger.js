import Exchange from '../exchange';
import Joi from 'joi';

export default new Exchange('retrigger-created').
  title('Retrigger event exchange').
  name('retrigger').
  description(`
    Sent when successfully processing a retrigger request.
  `).
  routingKeys(
    {
      name: 'taskId',
      summary: 'Task ID for given retrigger'
    }
  ).
  schema(Joi.object().keys({
    requester: Joi.string().required().description('User who requested retrigger'),
    taskGroupId: Joi.string().required().description('Group/Graph for retrigger')
  }));
