/**
 * Automation rule types (stored as JSON on AutomationRule model).
 * Engine evaluation ships in V2 per master prompt.
 */
export type AutomationTrigger =
  | 'LEAD_CREATED'
  | 'LEAD_STAGE_CHANGED'
  | 'LEAD_SCORED'
  | 'MESSAGE_RECEIVED'
  | 'NO_REPLY_X_DAYS'
  | 'TAG_ADDED'
  | 'DEAL_CREATED';

export type AutomationRuleShape = {
  name: string;
  trigger: {
    event: AutomationTrigger;
    delayDays?: number;
  };
  conditions: Array<{
    field: string;
    op: 'eq' | 'gt' | 'lt' | 'contains' | 'not';
    value: string | number;
  }>;
  actions: Array<{
    type: 'SEND_SMS' | 'SEND_EMAIL' | 'CREATE_TASK' | 'MOVE_STAGE' | 'ADD_TAG' | 'NOTIFY';
    templateId?: string;
    stageId?: string;
    tag?: string;
    taskTitle?: string;
    daysFromNow?: number;
  }>;
};

export const DEFAULT_RULE_SEEDS: AutomationRuleShape[] = [
  {
    name: 'Hot Lead Alert',
    trigger: { event: 'LEAD_SCORED' },
    conditions: [{ field: 'aiScore', op: 'gt', value: 70 }],
    actions: [
      { type: 'ADD_TAG', tag: 'hot' },
      { type: 'NOTIFY' },
    ],
  },
  {
    name: '3-Day Follow-Up',
    trigger: { event: 'NO_REPLY_X_DAYS', delayDays: 3 },
    conditions: [{ field: 'status', op: 'eq', value: 'CONTACTED' }],
    actions: [{ type: 'SEND_SMS', templateId: 'follow_up_1' }],
  },
  {
    name: 'Reply → Move to Interested',
    trigger: { event: 'MESSAGE_RECEIVED' },
    conditions: [],
    actions: [{ type: 'MOVE_STAGE' }],
  },
];
