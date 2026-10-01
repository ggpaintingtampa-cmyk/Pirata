import { z } from 'zod';
import { LOCALES, type Locale } from './tools.js';
// Update 2026-09-29 (P13): English/Spanish translation of user-written content. The interface dictionaries live in the
// web app; this file owns the record/field addressing, the lookup/translate DTOs, the glossary and the owner settings.
const id=z.string().min(1).max(100), stamp=z.number().int().nonnegative();
const record={id,createdAt:stamp,updatedAt:stamp};
const command=<T extends string,S extends z.ZodRawShape>(type:T,fields:S)=>z.object({type:z.literal(type),...fields}).strict();

export const localeSchema=z.enum(LOCALES);
export type { Locale };
export const SOURCE_LOCALES=['en','es','mixed','unknown'] as const;
export type SourceLocale=typeof SOURCE_LOCALES[number];

/** Every record kind with free text a person may write. Literal values (names, addresses, codes, amounts) are never addressed. */
export const TRANSLATABLE_KINDS=['task','project','question','projectNote','taskTemplate','projectTemplate','materialRequest','dayNote','message','attachmentComment','equipmentReport','shift','objective','timeEntry','toolSignOut','scheduleBlock','expense','maintenance','equipment','projectFact','taskRequirement','client','lead','leadFollowUp'] as const;
export type TranslatableKind=typeof TRANSLATABLE_KINDS[number];
export const translatableKindSchema=z.enum(TRANSLATABLE_KINDS);
/** A field name, or a template tree path such as `tree.0.2.title` or `tree.0.requirements.1.note`. */
export const fieldNameSchema=z.string().min(1).max(80).regex(/^[a-zA-Z]+(\.[a-zA-Z0-9]+)*$/,'Unknown field.');
export const translationItemSchema=z.object({kind:translatableKindSchema,id,field:fieldNameSchema}).strict();
export type TranslationItem=z.infer<typeof translationItemSchema>;

export const translationLookupSchema=z.object({target:localeSchema,items:z.array(translationItemSchema).min(1).max(200)}).strict();
export const translationTranslateSchema=z.object({target:localeSchema,items:z.array(translationItemSchema).min(1).max(40)}).strict();
export const TRANSLATION_STATUSES=['same','ready','corrected','unsure','pending','unavailable'] as const;
export type TranslationStatus=typeof TRANSLATION_STATUSES[number];
export const UNAVAILABLE_REASONS=['disabled','budget','provider','offline','missing'] as const;
export const translationResultSchema=z.object({
  kind:translatableKindSchema,id,field:fieldNameSchema,
  status:z.enum(TRANSLATION_STATUSES),
  text:z.string().optional(),
  sourceLocale:z.enum(SOURCE_LOCALES),
  confidence:z.number().int().min(0).max(100),
  sourceHash:z.string().length(64).optional(),
  stale:z.literal(true).optional(),
  reason:z.enum(UNAVAILABLE_REASONS).optional(),
}).strict();
export type TranslationResult=z.infer<typeof translationResultSchema>;
export const translationResponseSchema=z.object({revision:stamp,epoch:stamp,items:z.array(translationResultSchema)}).strict();
export type TranslationResponse=z.infer<typeof translationResponseSchema>;

export const translationCorrectSchema=z.object({...translationItemSchema.shape,target:localeSchema,text:z.string().trim().min(1).max(8000)}).strict();
export const translationSourceSchema=z.object({...translationItemSchema.shape,locale:localeSchema}).strict();

export const TRANSLATION_PROVIDERS=['openai','none'] as const;
export const translationSettingsSchema=z.object({
  enabled:z.boolean(), provider:z.enum(TRANSLATION_PROVIDERS), model:z.string().trim().max(100),
  dailyRequests:z.number().int().min(0).max(10000), monthlyBudgetCents:z.number().int().min(0).max(100000),
  inputCentsPerMillion:z.number().int().min(0).max(100000), outputCentsPerMillion:z.number().int().min(0).max(100000),
}).strict();
export type TranslationSettings=z.infer<typeof translationSettingsSchema>;
export const translationBackfillSchema=z.object({target:localeSchema,limit:z.number().int().min(1).max(200).default(100)}).strict();

export const glossaryTermSchema=z.object({...record,en:z.string(),es:z.string(),note:z.string(),createdBy:id}).strict();
export type GlossaryTerm=z.infer<typeof glossaryTermSchema>;
const term=z.string().trim().min(1).max(80);
export const translationCommands=[
  command('glossary.save',{id:id.optional(),en:term,es:term,note:z.string().trim().max(300).default('')}),
  command('glossary.remove',{id}),
] as const;
export const translationSnapshot={translationGlossary:z.array(glossaryTermSchema).optional(),translationEpoch:stamp.optional()};
export interface TranslationSnapshot {translationGlossary?:GlossaryTerm[];translationEpoch?:number}

/** Search in the viewer's language (P13 §13.4). */
export const searchResultSchema=z.object({kind:translatableKindSchema,id,field:fieldNameSchema,title:z.string(),snippet:z.string(),matchedIn:z.enum(['original','translation']),projectId:id.nullable()}).strict();
export type SearchResult=z.infer<typeof searchResultSchema>;
export const searchResponseSchema=z.object({query:z.string(),locale:localeSchema,results:z.array(searchResultSchema),translatedCoverage:z.enum(['full','partial','none'])}).strict();
export type SearchResponse=z.infer<typeof searchResponseSchema>;
