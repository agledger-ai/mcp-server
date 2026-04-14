import { z } from 'zod';

export const ContractTypeEnum = z.enum([
  'ACH-PROC-v1',
  'ACH-DLVR-v1',
  'ACH-DATA-v1',
  'ACH-TXN-v1',
  'ACH-ORCH-v1',
  'ACH-COMM-v1',
  'ACH-AUTH-v1',
  'ACH-INFRA-v1',
  'ACH-DEL-v1',
  'ACH-ANALYZE-v1',
  'ACH-COORD-v1',
  'ACH-MON-v1',
  'ACH-REVIEW-v1',
]).describe('AGLedger standard contract type identifier');

export const MandateStatusEnum = z.enum([
  'CREATED', 'PROPOSED', 'ACTIVE', 'PROCESSING',
  'REVISION_REQUESTED', 'FULFILLED', 'FAILED',
  'REMEDIATED', 'EXPIRED', 'CANCELLED', 'REJECTED',
]).describe('Mandate lifecycle status');

export const HubStateEnum = z.enum(['OFFERED', 'ACCEPTED', 'ACTIVE', 'COMPLETED', 'DISPUTED', 'TERMINAL']).describe('Federation hub-level mandate state');
export const GatewayStatusEnum = z.enum(['active', 'suspended', 'revoked']).describe('Federation gateway registration status');
export const RevocationReasonEnum = z.enum(['key_compromise', 'decommission', 'administrative']).describe('Reason for revoking a federation gateway');
export const FederationSignalEnum = z.enum(['SETTLE', 'HOLD', 'RELEASE']).describe('Settlement signal type');
export const FederationOutcomeEnum = z.enum(['PASS', 'FAIL']).describe('Federation verification outcome');

export const OperatingModeEnum = z.enum(['cleartext', 'encrypted']).describe('Operating mode for the mandate');
export const RiskClassificationEnum = z.enum(['high', 'limited', 'minimal', 'unclassified']).describe('EU AI Act risk classification');
export const DisputeStatusEnum = z.enum([
  'OPENED', 'TIER_1_REVIEW', 'EVIDENCE_WINDOW', 'TIER_2_REVIEW',
  'ESCALATED', 'TIER_3_ARBITRATION', 'RESOLVED', 'WITHDRAWN',
]).describe('Dispute lifecycle status');
export const StructuralValidationEnum = z.enum(['ACCEPTED', 'INVALID']).describe('Receipt structural validation result');
export const VerificationOutcomeEnum = z.enum(['PASS', 'FAIL', 'REVIEW_REQUIRED']).describe('Verification outcome (system verdict)');

export const NextStepSchema = z.object({
  action: z.string().describe('What to do next'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method'),
  href: z.string().describe('Relative URL template'),
  description: z.string().describe('Why this step matters'),
}).describe('Suggested next API call');

export const NextStepsField = z.array(NextStepSchema).nullable().optional().describe('Suggested next API calls — guides agents through the lifecycle');
