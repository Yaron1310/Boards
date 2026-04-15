
import admin from 'firebase-admin';

// --- HIERARCHY & TENANCY ---

export interface DBAcademy {
  id: string;
  name: string;
  planId?: string;
  createdAt: admin.firestore.Timestamp | Date | any;
  subscriptionStatus?: 'active' | 'past_due' | 'cancelled' | 'incomplete';
}

export interface GrowthAllowanceTier {
  minUsers: number;
  maxUsers: number | null; // null for the last tier (e.g., 10001+)
  percentage: number; // e.g., 0.1 for 10%
  absolute: number;
}

export interface DBPlan {
  id: string;
  academyId: string;
  name: string;
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
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
  priceMonthly?: number; // New
  currency?: string;     // New
  accessRules?: {
    revokeChat?: 'never' | 'on_course_completion' | 'after_duration';
    revokeChatCourseId?: string | null;
    revokeChatAfterDays?: number | null;
    revokeChatAfterCompletionDays?: number | null;
    postAccessBehavior?: 'revoke_all' | 'content_only'; // Defines what happens when access ends
  };
}


export interface DBOrganization { 
  id: string; 
  name: string; 
  academyId: string; // Link to the parent academy
  createdAt: admin.firestore.Timestamp | Date | any; 
  updatedAt?: admin.firestore.Timestamp | Date | any;
  planId?: string; // Link to a plan
  paymentMethod?: 'direct' | 'gymind'; // DEPRECATED in favor of subscriptionProvider
  subscriptionProvider?: 'woocommerce' | 'gymind' | 'manual'; // The source of truth
  subscriptionStatus?: 'active' | 'cancelled' | 'past_due' | 'trialing' | 'incomplete';
  cancelAtPeriodEnd?: boolean; // New flag for pending cancellation
  subscriptionEndDate?: admin.firestore.Timestamp | Date | any; // End date of current billing period
  isPersonal?: boolean; // New flag for single-user workspaces
  status?: 'active' | 'archived';
}

export interface DBAcademyBillingCycle {
    id: string; // e.g., "academyId_2024-08"
    academyId: string;
    billingCycleStart: admin.firestore.Timestamp | Date;
    billingCycleEnd: admin.firestore.Timestamp | Date;
    baselineUserCount: number;
    growthAllowance: number;
    topUpUserCount: number;
    calculatedTokenLimit: number;
    currentTokenUsage: number;
    notification70Sent: boolean;
    notification85Sent: boolean;
    notification95Sent: boolean;
    createdAt: admin.firestore.Timestamp | Date | any;
}

export interface DBTransaction {
    id: string;
    academyId: string;
    billingCycleId: string;
    amount: number;
    currency: string;
    description: string;
    type: 'top-up';
    createdAt: admin.firestore.Timestamp | Date;
}

export interface DBPendingCheckout {
    id: string;
    name: string;
    email: string;
    password?: string;
    company: string;
    address: string;
    city: string;
    zip: string;
    country: string;
    planId: string;
    academyId: string;
}

export interface DBPaymentInitiationSession {
    id: string;
    userId?: string; 
    organizationId?: string; // New field to support upgrades
    planId: string;
    academyId: string;
    isForSingleUser: boolean;
    name: string;
    email: string;
    passwordHash?: string;
    company: string;
    address: string;
    city: string;
    zip: string;
    country: string;
    createdAt: admin.firestore.Timestamp | Date | any;
    // Status tracking for idempotency
    status?: 'pending' | 'completed';
    createdUserId?: string;
    createdOrgId?: string;
}


// ... rest of the file remains unchanged ...
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

export interface DBAcademySettings {
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
  updatedAt: admin.firestore.Timestamp | Date | any;
  displayNameColor?: string;
  sidebarLinkColor?: string;
  publicPlansPage?: {
    enabled: boolean;
    enableGradient?: boolean; // New field
    gradientHueRotation?: number; // Decoupled setting
    gradientHeight?: number;      // Decoupled setting
    gradientMaskOpacity?: number; // Decoupled setting
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

export interface DBSystemSettings {
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

export interface DBTutorialSettings {
  id?: string; 
  aiMentor?: TutorialLink;
  courses?: TutorialLink;
  questionnaires?: TutorialLink;
  plansBilling?: TutorialLink;
  wpPlugin?: TutorialLink;
  theme?: TutorialLink;
  organizations?: TutorialLink;
  users?: TutorialLink;
}


export enum UserRole {
  REGULAR_USER = 'regular_user',
  ORGANIZATION_ADMIN = 'organization_admin',
  ACADEMY_ADMIN = 'academy_admin',
  SYSTEM_ADMIN = 'system_admin',
}

export interface DBUser {
  id: string;
  email: string;
  name:string;
  passwordHash?: string;
  profileImageUrl?: string;
  googleId?: string;
  microsoftId?: string;
  status: 'pending' | 'active' | 'disabled' | 'pending_setup';
  emailVerified?: boolean; 
  createdAt: admin.firestore.Timestamp | Date | any;
  hasSeenChatPrivacyNotice?: boolean;
  conversationSavingEnabled?: boolean;
  preferredLanguage?: string;
  passwordResetId?: string;
  failedLoginAttempts?: number;
  lockoutUntil?: admin.firestore.Timestamp | Date | null | any;
  registrationType?: 'standard' | 'payment';
  primaryAcademyId?: string;
  defaultOrganizationId?: string;
  // Denormalized counts
  completedQuestionnairesCount?: number;
  conversationCount?: number;
  completedCourseCount?: number;
}

export interface DBMembership {
  id: string;
  userId: string;
  entityId: string;
  entityType: 'organization' | 'academy';
  role: UserRole;
  academyId: string;
  createdAt: admin.firestore.Timestamp | Date | any;
  // Denormalized user fields for list views (kept in sync via profile-update fan-out)
  userName?: string;
  userEmail?: string;
  userProfileImageUrl?: string;
  userStatus?: string;
  userCreatedAt?: admin.firestore.Timestamp | Date | any;
  userHasPassword?: boolean;
  // Denormalized user counts
  completedQuestionnairesCount?: number;
  conversationCount?: number;
  completedCourseCount?: number;
}


export interface DBUserAccessStatus {
    id: string; 
    planId: string;
    organizationId: string;
    planType: 'one-time' | 'subscription';
    tokenLimit?: number; 
    tokensUsed?: number; 
    monthlyTokenLimit?: number; 
    monthlyTokensUsed?: number; 
    usageResetDate?: admin.firestore.Timestamp | Date | any; 
    hasAccess: boolean; 
    updatedAt: admin.firestore.Timestamp | Date | any;
}

export interface DBPreapprovedUser {
  id: string;
  email: string;
  organizationId: string;
  academyId: string;
  addedBy: string;
  createdAt: admin.firestore.Timestamp | Date | any;
}


export interface DBMessage {
  id: string; 
  sender: 'user' | 'ai'; 
  text: string; 
  timestamp: Date; 
  isError?: boolean
}

export interface DBConversation {
  id: string;
  userId: string;
  personaId: string;
  personaName: string;
  date: Date;
  messages?: Array<DBMessage>;
  messageCount: number;
  lastMessageAt?: Date;
  extractedFactors?: { [key: string]: string };
  createdAt: admin.firestore.Timestamp | Date | any;
  isPrivate?: boolean;
  academyId?: string;
  organizationId?: string;
}

export interface DBTriggerPhrase { 
  id: string; 
  language: string; 
  phrase: string; 
  academyId: string;
  createdAt: admin.firestore.Timestamp | Date | any; 
}

export interface DBChatPersona {
  id: string;
  academyId: string;
  name: string;
  description: string;
  personaPreamble?: string;
  systemPrompt: string;
  extractionSettings: ExtractionSetting[];
  aiInsightPrompt: string;
  aiInsightSettings: AIInsightSetting[];
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
  status?: 'active' | 'archived';
  includePersonalization?: boolean;
  isInitialMessageEnabled?: boolean;
  initialMessage?: string;
  summaryInstructions?: string;
  planIds?: string[];
}

export interface DBPersonalInsight {
  id: string;
  userId: string;
  key: string;
  label: string;
  value: string | number | boolean;
  source: string;
  updatedAt: admin.firestore.Timestamp | Date | any;
}


export type QuestionnaireType = 'categorical' | 'custom';
export type QuestionType = 'multiple_choice' | 'open_text';

export interface DBQuestionnaire {
  id: string;
  academyId: string;
  name: string;
  description: string;
  type?: QuestionnaireType;
  passingScore?: number;
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
  status?: 'active' | 'archived';
  resultSettings: {
    showGraph: boolean;
    numberOfTopCategories: number;
    includeTies?: boolean;
    saveToInsights?: boolean;
  };
  categoryCount?: number;
}

export interface DBCategory {
  id: string;
  questionnaireId: string;
  name: string;
  description: string;
  videoUrl: string;
  order: number;
  showNameInQuiz?: boolean;
}

export interface DBQuestion {
  id: string;
  categoryId: string;
  text: string;
  type?: QuestionType;
  order: number;
  answers: DBAnswer[];
  correctAnswerId?: string;
  customScore?: number;
  correctAnswerText?: string;
}

export interface DBAnswer {
  id: string;
  text: string;
  score: number;
}

export interface DBUserQuestionnaireResult {
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
  createdAt: admin.firestore.Timestamp | Date | any;
}

export interface DBCourseAnswer {
  id: string;
  text: string;
}

export interface DBCourseQuestion {
  id: string;
  order: number;
  text: string;
  answers: DBCourseAnswer[];
  correctAnswerId: string;
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
}

export interface DBCourse {
  id: string;
  academyId: string;
  name: string;
  description: string;
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
  status?: 'active' | 'archived';
  planIds?: string[];
  lessonCount?: number;
  coverImage?: string;
  totalDuration?: number;
  promoVideoUrl?: string;
}

export interface DBInsightField {
  htmlElementId: string;
  key: string;
  label: string;
}

export interface DBLessonAssignment {
  type: 'chat' | 'questionnaire' | 'custom_code';
  id: string; 
  name: string;
  isMandatory: boolean;
  customHtml?: string;
  customCss?: string;
  customJs?: string;
  insightFields?: DBInsightField[];
  endButtonId?: string;
  autoOpenEnabled?: boolean;
  autoOpenTimestamp?: number;
  isInsightsPrivate?: boolean;
}

export interface DBLesson {
  id: string;
  courseId: string;
  name: string;
  description: string;
  videoUrl: string;
  transcript: string;
  powerpointUrl?: string;
  order: number;
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
  questions?: DBCourseQuestion[];
  assignments?: DBLessonAssignment[];
  isBridgeVideo?: boolean;
  bridgeVideoUrl?: string;
  videoDuration?: number;
}

export interface DBUserCourseProgress {
  id: string; 
  userId: string;
  courseId: string;
  organizationId?: string; 
  academyId: string; 
  status: 'not-started' | 'in-progress' | 'completed';
  completedLessons: string[]; 
  startedAt: Date;
  completedAt?: Date;
  updatedAt: admin.firestore.Timestamp | Date | any;
}

export interface DBTokenUsage {
  id: string;
  userId: string;
  organizationId: string | null;
  academyId: string | null;
  model: string;
  apiEndpoint: string;
  totalTokens: number;
  createdAt: admin.firestore.Timestamp | Date | any;
}


export interface JwtUserPayload {
  id: string;
  role: UserRole;
  selectedOrganizationId: string;
  academyId: string;
}

export interface JwtMultiOrgPayload {
    id: string;
    action: 'select-organization' | 'academy-setup';
}

export interface JwtApprovalPayload {
    userId: string;
    action: 'approve_user';
}

export interface JwtVerificationPayload {
    userId: string;
    action: 'verify_email' | 'verify_academy_admin';
    planId?: string;
    checkoutSessionId?: string;
}

export interface JwtPasswordResetPayload {
    userId: string;
    resetId: string;
    action: 'reset_password';
}


// --- Pagination ---

export interface PaginatedResponse<T> {
    data: T[];
    cursor: string | null;
    hasMore: boolean;
    total?: number;
}

declare global {
  namespace Express {
    interface User extends Partial<DBUser>, Partial<JwtUserPayload>, Partial<JwtMultiOrgPayload> {}
    interface Request {
      academyId?: string;
    }
  }
}

// --- MARKETING / NEWSLETTERS ---

export interface DBNewsletterEdition {
  id: string;
  campaignId: string;
  academyId: string;
  subject: string;
  htmlContent: string;
  title: string;
  subtitle: string;
  mainText: string;
  showLogoInHeader?: boolean;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledFor?: Date;
  sentAt?: Date;
  totalRecipients: number;
  successCount: number;
  failCount: number;
  order?: number;                   // Edition order for trigger-based campaigns
  reminder3DaySent?: boolean;
  reminder1DaySent?: boolean;
  createdBy: string;
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
}

export interface DBNewsletterCampaign {
  id: string;
  academyId: string;
  name: string;
  campaignType?: 'scheduled' | 'trigger';  // Defaults to 'scheduled'
  triggerType?: 'registration' | 'course_enrollment' | 'course_completion';
  triggerCourseId?: string;                 // Required when triggerType === 'course_enrollment' or 'course_completion'
  recipientGroup: 'all_users' | 'organization' | 'course_enrolled' | 'course_completed';
  recipientFilter?: string;         // orgId or courseId depending on group
  frequency: 'one_time' | 'weekly' | 'biweekly' | 'monthly';
  scheduledDay?: number;            // Day of week (0-6) for weekly/biweekly, day of month (1-28) for monthly
  scheduledTime?: string;           // HH:mm in academy's preferred timezone (e.g. "09:00")
  timezone?: string;                // e.g. "Asia/Jerusalem", "America/New_York"
  status: 'active' | 'paused' | 'archived';
  autoCreateNextDraft: boolean;
  createdBy: string;
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
}

export interface DBTriggerEnrollment {
  id: string;
  campaignId: string;
  academyId: string;
  userId: string;
  userEmail: string;
  triggerType: 'registration' | 'course_enrollment' | 'course_completion';
  triggerCourseId?: string;
  triggerDate: Date;
  nextEditionOrder: number;         // Starts at 1
  nextSendAfter: Date;              // Earliest time the next edition can be sent
  status: 'active' | 'completed' | 'cancelled';
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
}

// --- AUDIT LOGGING ---

export type AuditAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'ANOMALY';
export type AuditResourceType = 'user' | 'conversation' | 'personalInsight' | 'organization' | 'course' | 'academy';

export interface DBAuditLog {
  id: string;
  actorUserId: string;
  actorRole: UserRole;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  organizationId?: string;
  academyId?: string;
  changes?: { before: unknown; after: unknown };
  ipAddress?: string;
  userAgent?: string;
  details?: string;
  timestamp: admin.firestore.Timestamp | Date | any;
  /** Firestore TTL field — documents are auto-deleted 12 months after creation. */
  expiresAt: admin.firestore.Timestamp | Date | any;
}

export interface DBEmailTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  html: string;
  variables: string[];
  updatedAt: admin.firestore.Timestamp | Date | any;
  updatedBy?: string;
}
