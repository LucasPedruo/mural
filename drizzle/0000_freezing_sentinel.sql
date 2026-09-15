CREATE TYPE "public"."personal_board_type" AS ENUM('diarias', 'publicidade', 'financas');--> statement-breakpoint
CREATE TYPE "public"."personal_period_type" AS ENUM('semanal', 'mensal');--> statement-breakpoint
CREATE TYPE "public"."personal_priority" AS ENUM('baixa', 'media', 'alta');--> statement-breakpoint
CREATE TABLE "personal_boards" (
	"id" "personal_board_type" PRIMARY KEY NOT NULL,
	"title" varchar(120) NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"period_type" "personal_period_type" NOT NULL,
	"columns" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"column_id" varchar(80) NOT NULL,
	"priority" "personal_priority" DEFAULT 'media' NOT NULL,
	"due_date" varchar(10) DEFAULT '' NOT NULL,
	"partner" varchar(120) DEFAULT '' NOT NULL,
	"value" varchar(80) DEFAULT '' NOT NULL,
	"channel" varchar(120) DEFAULT '' NOT NULL,
	"category" varchar(120) DEFAULT '' NOT NULL,
	"installments" varchar(80) DEFAULT '' NOT NULL,
	"recurrence" varchar(120) DEFAULT '' NOT NULL,
	"source" varchar(40) DEFAULT 'site' NOT NULL,
	"source_message_id" varchar(120) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" "personal_board_type" NOT NULL,
	"period_key" varchar(24) NOT NULL,
	"name" varchar(120) NOT NULL,
	"starts_on" varchar(10) NOT NULL,
	"ends_on" varchar(10) NOT NULL,
	"open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_jid" varchar(120) NOT NULL,
	"message_id" varchar(120) NOT NULL,
	"board_id" "personal_board_type" NOT NULL,
	"text" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination_jid" varchar(120) NOT NULL,
	"kind" varchar(60) NOT NULL,
	"text" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_cards" ADD CONSTRAINT "personal_cards_period_id_personal_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."personal_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_periods" ADD CONSTRAINT "personal_periods_board_id_personal_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."personal_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_cards_period_idx" ON "personal_cards" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "personal_cards_source_message_idx" ON "personal_cards" USING btree ("source_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_periods_board_key_idx" ON "personal_periods" USING btree ("board_id","period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_messages_group_message_idx" ON "whatsapp_messages" USING btree ("group_jid","message_id");