export enum UserRole {
  REGULAR_USER = 'regular_user',
  ORGANIZATION_ADMIN = 'workspace_admin',
  ACADEMY_ADMIN = 'org_admin',
  SYSTEM_ADMIN = 'system_admin',
}

export interface GrowthAllowanceTier {
  minUsers: number;
  maxUsers: number | null;
  percentage: number;
  absolute: number;
}


export interface Plan {
  id: string;
  orgId: string;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
  status?: 'active' | 'archived';

  accessibleCourseIds?: string[];
  hasAllCoursesAccess?: boolean;

  accessibleChatPersonaIds?: string[];
  hasAllChatAccess?: boolean;

  accessibleQuestionnaireIds?: string[];
  hasAllQuestionnairesAccess?: boolean;

  planType?: 'subscription' | 'one-time';
  isForSingleUser?: boolean;
  maxUsers?: number;
  priceMonthly?: number;
  currency?: string;
  accessRules?: {
    revokeChat?: 'never' | 'on_course_completion' | 'after_duration';
    revokeChatCourseId?: string | null;
    revokeChatAfterDays?: number | null;
    revokeChatAfterCompletionDays?: number | null;
    postAccessBehavior?: 'revoke_all' | 'content_only';
  };
}

export interface Workspace {
  id: string;
  name: string;
  orgId: string;
  academyName?: string; 
  planId?: string;
  planName?: string;
  planType?: 'subscription' | 'one-time';
  paymentMethod?: 'direct' | 'gymind'; // DEPRECATED
  subscriptionProvider?: 'woocommerce' | 'gymind' | 'manual';
  subscriptionStatus?: 'active' | 'cancelled' | 'past_due' | 'trialing' | 'incomplete';
  cancelAtPeriodEnd?: boolean;
  subscriptionEndDate?: string | Date | any;
  hasChatAccess?: boolean;
  hasMindPatternsAccess?: boolean;
  isPersonal?: boolean;
  status?: 'active' | 'archived';
}

// ... rest of the file remains unchanged ...
export interface Workspace {
  id: string;
  name: string;
}

export interface ExtractionSetting {
  key: string;
  label: string;
  enabled: boolean;
}

export interface AIInsightSetting {
  key: string;
  label: string;
  enabled: boolean;
}

export interface PublicPlanConfig {
  planId: string;
  displayName: string;
  billingCycle: string;
  description: string;
  bullets: string[];
  buttonText: string;
  tagText?: string;
  tagColor?: string;
  tagTextColor?: string; // New field
}

export interface AcademySettings {
  id: string; 
  sidebarColor: string;
  enableSidebarGradient?: boolean;
  sidebarHueRotation?: number;
  sidebarGradientHeight?: number;
  sidebarGradientMaskOpacity?: number;
  appName: string;
  logoUrl: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  socialMedia?: {
      twitter?: string;
      linkedin?: string;
      facebook?: string;
      instagram?: string;
  };
  apiKey?: string;
  subscriptionCancellationWebhookUrl?: string;
  displayNameColor?: string;
  sidebarLinkColor?: string;
  publicPlansPage?: {
    enabled: boolean;
    enableGradient?: boolean; 
    gradientHueRotation?: number; // New
    gradientHeight?: number;      // New
    gradientMaskOpacity?: number; // New
    pageHeader: string;
    headerFontWeight?: string; 
    cardBackgroundColor?: string; // Global setting
    cardBorderColor?: string;     // Global setting
    cardFontColor?: string;       // Global setting
    buttonBackgroundColor?: string; // Global setting
    buttonTextColor?: string;       // Global setting
    customized?: boolean;           // True once admin has explicitly saved these settings
    selectedPlans: PublicPlanConfig[];
  };
  bridgeEnabled?: boolean;
  bridgeSecretKey?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  html: string;
  variables: string[];
  updatedAt?: string | Date | any;
  updatedBy?: string;
}

export interface SystemSettings {
  id?: string; 
  oneTimeTokensPerLesson: number;
  oneTimeGeneralTokens: number;
  subscriptionMonthlyLimit: number;
  growthAllowanceTiers?: GrowthAllowanceTier[];
  geminiProModelName?: string;
  geminiFlashModelName?: string;
  costPer1000TokensPro?: number;
  rawCostPer1000TokensPro?: number;
  profitMarginPer1000TokensPro?: number;
  costPer1000TokensFlash?: number;
  rawCostPer1000TokensFlash?: number;
  profitMarginPer1000TokensFlash?: number;
  globalSystemPrompt?: string;
}

export interface TutorialLink {
  enabled: boolean;
  videoUrl: string;
}

export interface TutorialSettings {
  aiMentor?: TutorialLink;
  courses?: TutorialLink;
  questionnaires?: TutorialLink;
  plansBilling?: TutorialLink;
  wpPlugin?: TutorialLink;
  theme?: TutorialLink;
  workspaces?: TutorialLink;
  users?: TutorialLink;
}

export interface ChatPersona {
  id: string;
  orgId: string;
  name: string;
  description: string;
  personaPreamble?: string;
  systemPrompt: string;
  extractionSettings: ExtractionSetting[];
  aiInsightPrompt: string;
  aiInsightSettings: AIInsightSetting[];
  createdAt: Date;
  updatedAt: Date;
  status?: 'active' | 'archived';
  includePersonalization?: boolean;
  isInitialMessageEnabled?: boolean;
  initialMessage?: string;
  summaryInstructions?: string;
}


export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole; 
  dbRoles?: {
    systemAdmin?: boolean;
    academyAdmin?: string[];
    organizationAdmin?: string[];
  };
  status: 'pending' | 'active' | 'disabled' | 'pending_setup';
  workspaces: Pick<Workspace, 'id' | 'name' | 'orgId' | 'academyName' | 'isPersonal'>[]; 
  profileImageUrl?: string; 
  hasSeenChatPrivacyNotice?: boolean;
  conversationSavingEnabled?: boolean;
  preferredLanguage?: string;
  hasPassword?: boolean;
  tokenUsage?: {
    used: number;
    limit: number | null;
  };
  organizationId?: string; 
  organizationName?: string; 
  organizationHasMindPatternsAccess?: boolean;
  completedQuestionnairesCount?: number;
  conversationCount?: number;
  completedCourseCount?: number;
  allAcademies?: Workspace[]; 
}


export interface Part {
  text: string;
}

export interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  isError?: boolean; 
}

export type ExtractedFactors = { [key: string]: string };

export interface Conversation {
  id: string;
  userId: string;
  personaId: string;
  personaName: string;
  date: Date;
  messages?: Message[];
  messageCount: number;
  lastMessageAt?: Date;
  extractedFactors?: ExtractedFactors;
  isPrivate?: boolean;
  isInsightArchivedByUser?: boolean;
}

export interface ChatSession {
  chatId: string; 
  messages: Message[];
}

export interface TriggerPhrase {
  id: string;
  orgId: string;
  language: string; 
  phrase: string;   
}

export interface PreApprovedUser {
  id: string;
  email: string;
  organizationId: string;
  addedBy: string;
  createdAt: Date;
}

export interface TokenUsageData {
  [id: string]: { 
    used: number;
    limit: number | null;
  };
}

export interface AcademyBillingCycle {
    id: string;
    orgId: string;
    billingCycleStart: Date;
    billingCycleEnd: Date;
    baselineUserCount: number;
    growthAllowance: number;
    topUpUserCount: number;
    calculatedTokenLimit: number;
    currentTokenUsage: number;
    notification70Sent: boolean;
    notification85Sent: boolean;
    notification95Sent: boolean;
    createdAt: Date;
}

export interface PersonalInsight {
  id: string;
  userId: string;
  key: string;
  label: string;
  value: string | number | boolean;
  source: string;
  updatedAt: Date;
  isArchived?: boolean;
}


export type QuestionnaireType = 'categorical' | 'custom';
export type QuestionType = 'multiple_choice' | 'open_text';

export interface Questionnaire {
  id: string;
  orgId: string;
  name: string;
  description: string;
  type: QuestionnaireType;
  passingScore?: number;
  createdAt: Date;
  updatedAt: Date;
  status?: 'active' | 'archived';
  shuffleQuestions?: boolean;
  resultSettings: {
    showGraph: boolean;
    numberOfTopCategories: number;
    includeTies?: boolean;
    saveToInsights?: boolean;
  };
  categories?: Category[];
  categoryCount?: number;
}

export interface Category {
  id: string;
  questionnaireId: string;
  name: string;
  description: string;
  videoUrl: string;
  order: number;
  showNameInQuiz?: boolean;
  questions?: Question[];
}

export interface Question {
  id: string;
  categoryId: string;
  text: string;
  type: QuestionType;
  order: number;
  answers: Answer[];
  correctAnswerId?: string; 
  customScore?: number; 
  correctAnswerText?: string; 
}

export interface Answer {
  id: string;
  text: string;
  score: number; 
}

export interface UserQuestionnaireResult {
  id: string;
  userId: string;
  questionnaireId: string;
  questionnaireName: string;
  completedAt: Date;
  source?: 'standalone' | 'assignment';
  categoryScores: { categoryId: string; categoryName: string; score: number }[];
  topCategories: Array<{
    categoryId: string;
    name: string;
    score: number;
    description: string;
    videoUrl: string;
  }>;
  score?: number;
  passed?: boolean;
  isArchivedByUser?: boolean;
  responses?: Array<{
    questionId: string;
    questionText: string;
    answerId?: string;
    answerText?: string;
    correctAnswerText?: string;
    isCorrect?: boolean;
    pointsEarned?: number;
    feedback?: string;
  }>;
  createdAt?: Date;
}


export interface CourseAnswer {
  id: string;
  text: string;
}

export interface CourseQuestion {
  id: string;
  order: number;
  text: string;
  answers: CourseAnswer[];
  correctAnswerId: string;
}

export interface Course {
  id: string;
  orgId: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  status?: 'active' | 'archived';
  lessons?: Lesson[];
  lessonCount?: number;
  accessMode?: 'full' | 'read_only';
  coverImage?: string;
  totalDuration?: number;
  promoVideoUrl?: string;
}

export interface InsightField {
  htmlElementId: string;
  key: string;
  label: string;
}

export interface LessonAssignment {
  type: 'chat' | 'questionnaire' | 'custom_code';
  id: string;
  name: string;
  isMandatory: boolean;
  customHtml?: string;
  customCss?: string;
  customJs?: string;
  insightFields?: InsightField[];
  endButtonId?: string;
  autoOpenEnabled?: boolean;
  autoOpenTimestamp?: number;
  isInsightsPrivate?: boolean;
}

export interface Lesson {
  id: string;
  courseId: string;
  name: string;
  description: string;
  videoUrl: string;
  transcript: string;
  powerpointUrl?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
  questions?: CourseQuestion[];
  assignments?: LessonAssignment[];
  isBridgeVideo?: boolean;
  bridgeVideoUrl?: string;
  videoDuration?: number;
}

export interface UserCourseProgress {
  id: string; 
  userId: string;
  courseId: string;
  organizationId?: string;
  orgId: string;
  status: 'not-started' | 'in-progress' | 'completed';
  completedLessons: string[]; 
  startedAt: Date;
  completedAt?: Date;
  updatedAt: Date;
}

// --- MARKETING / NEWSLETTERS ---

export interface NewsletterEdition {
  id: string;
  campaignId: string;
  orgId: string;
  subject: string;
  htmlContent: string;
  title: string;
  subtitle: string;
  mainText: string;
  showLogoInHeader?: boolean;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledFor?: Date | string;
  sentAt?: Date | string;
  totalRecipients: number;
  successCount: number;
  failCount: number;
  order?: number;
  createdBy: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface NewsletterCampaign {
  id: string;
  orgId: string;
  name: string;
  campaignType?: 'scheduled' | 'trigger';
  triggerType?: 'registration' | 'course_enrollment' | 'course_completion';
  triggerCourseId?: string;
  recipientGroup: 'all_users' | 'workspace' | 'course_enrolled' | 'course_completed';
  recipientFilter?: string;
  frequency: 'one_time' | 'weekly' | 'biweekly' | 'monthly';
  scheduledDay?: number;
  scheduledTime?: string;
  timezone?: string;
  status: 'active' | 'paused' | 'archived';
  autoCreateNextDraft: boolean;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// --- Pagination ---

export interface PaginatedResponse<T> {
    data: T[];
    cursor: string | null;
    hasMore: boolean;
    total?: number;
}

export type SystemPrompts = {
    chatSystemPrompt: string;
};
export type ThemeSettings = Pick<AcademySettings, 'sidebarColor' | 'appName' | 'logoUrl'>;

// New Interface for Payment Payouts
export interface AcademyPayoutData {
    orgId: string;
    academyName: string;
    activeGymindOrgs: number;
    totalRevenue: number; // Org Payments
    totalTokenCost: number; // Gymind Cost
    netPayout: number; // Revenue - Cost
    currency: string;
}

// =============================================================================
// PHASE 4 — WORK MANAGEMENT DATA MODEL
// =============================================================================

export enum ColumnType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  STATUS = 'status',
  PERSON = 'person',
  DROPDOWN = 'dropdown',
  CHECKBOX = 'checkbox',
  TAGS = 'tags',
  TIME = 'time',
  EMAIL = 'email',
  PHONE = 'phone',
  LOCATION = 'location',
  TIME_RANGE = 'time_range',
  SIMPLE_FORMULA = 'simple_formula',
}

// --- Column settings per type ---

export interface TextColumnSettings {
  maxLength?: number;
  multiline?: boolean;
}

export interface NumberColumnSettings {
  precision?: number;
  unit?: string;
  summary?: 'sum' | 'avg' | 'min' | 'max' | 'count';
}

export interface DateColumnSettings {
  includeTime?: boolean;
}

export interface StatusOption {
  id: string;
  label: string;
  color: string;
}

export interface StatusColumnSettings {
  options: StatusOption[];
}

export interface PersonColumnSettings {
  multiple: boolean;
}

export interface DropdownOption {
  id: string;
  label: string;
}

export interface DropdownColumnSettings {
  options: DropdownOption[];
  multiple: boolean;
}

export interface TagsColumnSettings {
  allowCustom: boolean;
}

export interface SimpleFormulaColumnSettings {
  operation: 'add' | 'subtract' | 'multiply' | 'divide';
  fields: [string, string]; // exactly 2 columnIds
}

export type ColumnSettings =
  | TextColumnSettings
  | NumberColumnSettings
  | DateColumnSettings
  | StatusColumnSettings
  | PersonColumnSettings
  | DropdownColumnSettings
  | TagsColumnSettings
  | SimpleFormulaColumnSettings
  | Record<string, never>;

// --- Column definition ---

export interface Column {
  id: string;
  organizationId: string;
  name: string;
  type: ColumnType;
  settings: ColumnSettings;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// --- Column value types (stored inside Item.values) ---

export interface LocationValue {
  address: string;
}

export interface TimeRangeValue {
  start: Date | string;
  end: Date | string;
}

export type ColumnValueMap = Record<string, unknown>;

// --- Board ---

export interface Board {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  description?: string;
  order: number;
  createdBy: string;
  isArchived?: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// --- Group ---

export interface Group {
  id: string;
  organizationId: string;
  boardId: string;
  name: string;
  color?: string;
  order: number;
  isCollapsed?: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// --- Item (flat, stored at organization level) ---

export interface Item {
  id: string;
  organizationId: string;
  workspaceId: string;
  boardId: string;
  groupId: string;
  name: string;
  order: number;
  createdBy: string;
  isArchived?: boolean;
  // Indexed top-level fields (mirrored from values for querying/filtering)
  status?: string;
  assignees?: string[];
  dueDate?: Date | string;
  // Dynamic column values
  values: ColumnValueMap;
  createdAt: Date | string;
  updatedAt: Date | string;
}