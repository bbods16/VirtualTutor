import { Account } from "@domain/account/AccountBase";
import { Consent } from "@domain/account/Consent";

// --- Fixtures ---
export const validConsent = new Consent({
	privacyPolicyVersion: "v2.0",
	termsVersion: "v1.5",
	coppaParentalConsent: true,
	schoolContextFerpa: true,
});

export const outdatedConsent = new Consent({
	privacyPolicyVersion: "v1.0", // Outdated
	termsVersion: "v1.5",
	coppaParentalConsent: true,
	schoolContextFerpa: true,
});

export const missingCoppaConsent = new Consent({
	privacyPolicyVersion: "v2.0",
	termsVersion: "v1.5",
	coppaParentalConsent: false, // Invalid for underage
	schoolContextFerpa: true,
});

export const validAccount = new Account({
	accountId: "acc-123",
	studentId: "std-456",
	email: "student@school.edu",
	consent: validConsent,
});
/**
 *
 *     normalizeIntakePayload
 *
 */
export const normalizeIntakePayloadTestCases = [
	{
		description: "should successfully map a valid, complete payload",
		input: {
			rawEmail: "student@school.edu",
			externalId: "std-456",
			agreedPrivacy: "v2.0",
			agreedTerms: "v1.5",
			coppa: true,
			ferpa: true,
		},
		expectedOutput: {
			email: "student@school.edu",
			studentId: "std-456",
			consent: validConsent,
		},
		expectError: false,
	},
	{
		description: "should strip extraneous fields from the raw payload",
		input: {
			rawEmail: "student@school.edu",
			externalId: "std-456",
			agreedPrivacy: "v2.0",
			agreedTerms: "v1.5",
			coppa: true,
			ferpa: true,
			marketingOptIn: true, // Extraneous
			ipAddress: "192.168.1.1", // Extraneous
		},
		expectedOutput: {
			email: "student@school.edu",
			studentId: "std-456",
			consent: validConsent,
		},
		expectError: false,
	},
	{
		description:
			"should throw an error if a required field (e.g., studentId) is missing",
		input: {
			rawEmail: "student@school.edu",
			// externalId missing
			agreedPrivacy: "v2.0",
			agreedTerms: "v1.5",
			coppa: true,
			ferpa: true,
		},
		expectedOutput: null,
		expectError: true, // Assuming your normalize function throws on invalid shapes
	},
];

/**
 * createAccount
 */
export const createAccountTestCases = [
	{
		description:
			"should create and return a new Account with pendingQuiz status by default",
		input: {
			email: "newstudent@school.edu",
			studentId: "std-999",
			consent: validConsent,
		},
		expectedConditions: (account: Account) => {
			return (
				account.email === "newstudent@school.edu" &&
				account.studentId === "std-999" &&
				account.profileStatus === "pendingQuiz" &&
				account.activeSessionId === null &&
				account.consent === validConsent &&
				account.accountId !== undefined // Ensure ID generation occurs
			);
		},
		expectError: false,
	},
	{
		description:
			"should throw an error if attempting to create an account for an existing studentId",
		input: {
			email: "duplicate@school.edu",
			studentId: "std-456", // ID already used in fixtures
			consent: validConsent,
		},
		expectedConditions: null,
		expectError: true,
	},
];

/**
 *   getAccount
 *
 */
export const getAccountTestCases = [
	{
		description:
			"should return the correct Account object when a valid studentId is provided",
		input: "std-456",
		expectedOutput: validAccount, // Mock should return the fixture
	},
	{
		description:
			"should return null when the studentId does not exist in the database",
		input: "std-000-nonexistent",
		expectedOutput: null,
	},
	{
		description: "should return null if an empty string is passed",
		input: "",
		expectedOutput: null,
	},
];
// validateConsent
export const validateConsentTestCases = [
	{
		description: "should return true for fully valid, up-to-date consent",
		input: validConsent,
		expectedOutput: true,
	},
	{
		description:
			"should return false if the privacy policy version is outdated",
		input: outdatedConsent,
		expectedOutput: false,
	},
	{
		description:
			"should return false if COPPA parental consent is missing/false",
		input: missingCoppaConsent,
		expectedOutput: false,
	},
	{
		description: "should return false if FERPA school context is missing/false",
		input: new Consent({
			privacyPolicyVersion: validConsent.privacyPolicyVersion,
			termsVersion: validConsent.termsVersion,
			coppaParentalConsent: validConsent.coppaParentalConsent,
			schoolContextFerpa: false,
		}),
		expectedOutput: false,
	},
	{
		description:
			"should return false if the terms of service version is outdated",
		input: new Consent({
			privacyPolicyVersion: validConsent.privacyPolicyVersion,
			termsVersion: "v1.0", // Assuming v1.5 is required
			coppaParentalConsent: validConsent.coppaParentalConsent,
			schoolContextFerpa: validConsent.schoolContextFerpa,
		}),
		expectedOutput: false,
	},
];
