/** Consent — student/guardian privacy & legal-compliance acknowledgements.
 * Renamed and camelCased from the legacy `privacy` class in `AccountConsentState/Account.ts`.
 * Tracks the policy/terms versions a student has agreed to and the regulatory consent flags
 * (COPPA parental consent, FERPA school-context disclosure) gating data handling decisions.
 */
export class Consent {
	private _privacyPolicyVersion: string;
	private _termsVersion: string;
	private _coppaParentalConsent: boolean;
	private _schoolContextFerpa: boolean;

	constructor(data: {
		privacyPolicyVersion: string;
		termsVersion: string;
		coppaParentalConsent: boolean;
		schoolContextFerpa: boolean;
	}) {
		this._privacyPolicyVersion = data.privacyPolicyVersion;
		this._termsVersion = data.termsVersion;
		this._coppaParentalConsent = data.coppaParentalConsent;
		this._schoolContextFerpa = data.schoolContextFerpa;
	}

	get privacyPolicyVersion(): string {
		return this._privacyPolicyVersion;
	}
	get termsVersion(): string {
		return this._termsVersion;
	}
	get coppaParentalConsent(): boolean {
		return this._coppaParentalConsent;
	}
	get schoolContextFerpa(): boolean {
		return this._schoolContextFerpa;
	}

	set privacyPolicyVersion(version: string) {
		this._privacyPolicyVersion = version;
	}
	set termsVersion(version: string) {
		this._termsVersion = version;
		// TODO embed logic to reverify consent when updated
	}
	set coppaParentalConsent(consent: boolean) {
		this._coppaParentalConsent = consent;
	}
	set schoolContextFerpa(consent: boolean) {
		this._schoolContextFerpa = consent;
	}
	ValidateConsent(): boolean | Error {
		// Validates this consent form
		if (this._coppaParentalConsent && this._schoolContextFerpa) {
			return true;
		}
		return false;

		//embedded logic to verify
		//
	}
}
