import { z } from 'zod';
// Update 2026-09-29 (P10, section 20): the server-to-server work feed for Camino. Versioned contract, narrow scope:
// the connected subject's own assigned tasks, their projects' names and dates, requirements, schedule and day-plan
// dates, the subject's own running timer on a task, and ancestor titles for context. Never questions, notes, facts,
// money, pay, attachments, clients, addresses or other people's assignments.
const id=z.string().min(1).max(100), nullableId=id.nullable();
export const WORK_FEED_CONTRACT='pirata-work-feed/1';
export const INTEGRATION_SCOPES=['work.read','work.complete'] as const;
export type IntegrationScope=typeof INTEGRATION_SCOPES[number];
export const integrationScopeSchema=z.enum(INTEGRATION_SCOPES);
export interface WorkFeedProject {id:string;name:string;status:string;startDate:string|null;endDate:string|null;updatedAt:number}
export interface WorkFeedRequirement {kind:'material'|'tool'|'note';name:string;quantity:string;unit:string}
export interface WorkFeedTask {id:string;projectId:string|null;parentTaskId:string|null;title:string;description:string;status:'open'|'blocked'|'done';position:number;estimatedMinutes:number;completedAt:number|null;updatedAt:number;hasChildren:boolean;
  requirements:WorkFeedRequirement[];schedule:{date:string;startMinute:number;endMinute:number}|null;plannedDates:string[];activeSession:{sessionId:string;startedAt:number}|null}
/** An ancestor of an exported task that is not itself exported: shape and title only. */
export interface WorkFeedContext {id:string;parentTaskId:string|null;projectId:string|null;title:string;context:true}
export interface WorkFeedPage {contract:typeof WORK_FEED_CONTRACT;revision:number;serverNow:number;timezone:'America/New_York';subject:{userId:string;name:string;role:string};page:{cursor:string|null;next:string|null;limit:number};projects:WorkFeedProject[];tasks:WorkFeedTask[];context:WorkFeedContext[]}
export type WorkDisposition='available'|'unassigned'|'archived'|'deleted'|'done'|'unknown';
export interface WorkDispositions {revision:number;items:{id:string;disposition:WorkDisposition;status?:'open'|'blocked'|'done';completedAt?:number|null}[]}
export const workFeedQuerySchema=z.object({cursor:z.string().max(400).optional(),limit:z.coerce.number().int().min(1).max(500).default(200)}).strict();
export const workDispositionQuerySchema=z.object({ids:z.string().min(1).max(60000)}).strict();
/** Completion from Camino: the subject's own leaf task, at a reviewed source revision, naming the observed timer. */
export const workCompleteSchema=z.object({requestId:z.uuid(),taskId:id,sourceRevision:z.number().int().nonnegative(),expectedSessionId:nullableId.default(null)}).strict();
export interface WorkCompleteResult {requestId:string;revision:number;serverNow:number;changed:boolean;task:{id:string;status:'open'|'blocked'|'done';completedAt:number|null}}
// Owner administration of tokens. The plaintext is returned once on creation and never stored.
export const integrationTokenCreateSchema=z.object({label:z.string().trim().min(1).max(80),subjectUserId:id,scopes:z.array(integrationScopeSchema).min(1).max(2).refine(s=>s.includes('work.read'),'The read scope is required.').refine(s=>new Set(s).size===s.length,'Duplicate scope.')}).strict();
export interface IntegrationTokenSummary {id:string;label:string;subjectUserId:string;subjectName:string;scopes:IntegrationScope[];createdAt:number;createdBy:string;lastUsedAt:number|null;revokedAt:number|null}
