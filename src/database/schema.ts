import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const personalBoardType = pgEnum('personal_board_type', [
  'diarias',
  'publicidade',
  'financas',
]);

export const personalPeriodType = pgEnum('personal_period_type', ['semanal', 'mensal']);

export const personalPriority = pgEnum('personal_priority', ['baixa', 'media', 'alta']);

export const personalBoards = pgTable('personal_boards', {
  id: personalBoardType('id').primaryKey(),
  title: varchar('title', { length: 120 }).notNull(),
  subtitle: text('subtitle').notNull().default(''),
  periodType: personalPeriodType('period_type').notNull(),
  columns: jsonb('columns').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const personalPeriods = pgTable(
  'personal_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: personalBoardType('board_id')
      .notNull()
      .references(() => personalBoards.id, { onDelete: 'cascade' }),
    periodKey: varchar('period_key', { length: 24 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    startsOn: varchar('starts_on', { length: 10 }).notNull(),
    endsOn: varchar('ends_on', { length: 10 }).notNull(),
    open: boolean('open').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    boardPeriodKey: uniqueIndex('personal_periods_board_key_idx').on(table.boardId, table.periodKey),
  }),
);

export const personalCards = pgTable(
  'personal_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => personalPeriods.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 180 }).notNull(),
    description: text('description').notNull().default(''),
    columnId: varchar('column_id', { length: 80 }).notNull(),
    priority: personalPriority('priority').notNull().default('media'),
    dueDate: varchar('due_date', { length: 10 }).notNull().default(''),
    partner: varchar('partner', { length: 120 }).notNull().default(''),
    value: varchar('value', { length: 80 }).notNull().default(''),
    channel: varchar('channel', { length: 120 }).notNull().default(''),
    category: varchar('category', { length: 120 }).notNull().default(''),
    installments: varchar('installments', { length: 80 }).notNull().default(''),
    recurrence: varchar('recurrence', { length: 120 }).notNull().default(''),
    source: varchar('source', { length: 40 }).notNull().default('site'),
    sourceMessageId: varchar('source_message_id', { length: 120 }).notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    periodIdx: index('personal_cards_period_idx').on(table.periodId),
    sourceMessageIdx: index('personal_cards_source_message_idx').on(table.sourceMessageId),
  }),
);

export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupJid: varchar('group_jid', { length: 120 }).notNull(),
    messageId: varchar('message_id', { length: 120 }).notNull(),
    boardId: personalBoardType('board_id').notNull(),
    text: text('text').notNull(),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    groupMessageIdx: uniqueIndex('whatsapp_messages_group_message_idx').on(
      table.groupJid,
      table.messageId,
    ),
  }),
);

export const whatsappNotifications = pgTable('whatsapp_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  destinationJid: varchar('destination_jid', { length: 120 }).notNull(),
  kind: varchar('kind', { length: 60 }).notNull(),
  text: text('text').notNull(),
  attempts: integer('attempts').notNull().default(0),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
