import { stringify } from "node:querystring";

enum ProfileStatuses {
	pendingQuiz = "pending",

	building = "building",
	ready = "ready",
	buildFailed = "buildFailed",
	archived = "archived",
	gatesSessionCreation = "gatesSessionCreation ",
}
export class privacy {
	privacyPolicyVersion: string;
	ConsentTermsVersion: string;
	ConsentcoppaParentalConsent: boolean;
	ConsentSchoolFerpa: boolean;

	constructor(data: {
		Version: string;
		ConsentTermsVersion: string;
		ConsentcoppaParentalConsent: boolean;
		ConsentSchoolFerpa: boolean;
	}) {
		this.privacyPolicyVersion = data["Version"];
		this.ConsentTermsVersion = data["ConsentTermsVersion"];
		this.ConsentcoppaParentalConsent = data["ConsentcoppaParentalConsent"];
		this.ConsentSchoolFerpa = data["ConsentSchoolFerpa"];
	}
}
export interface account {
	accountId: string;
	studentId: string;
	email: string;
	createdAt: Date;
	profileStatus: ProfileStatuses;
	activeSessionID: string;
	Privacy: privacy;
	EmailReg(email: string): string | Error;
}

export class Account implements account {}
