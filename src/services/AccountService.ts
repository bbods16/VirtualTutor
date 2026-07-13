import type { Account } from "@domain/account/AccountBase.ts";
import type { Consent } from "@domain/account/Consent.ts";

/**
 * AccountService — owns account creation, lookup, and consent validation.
 * Owns: translating raw intake/signup payloads into domain `Account`/`Consent` records and
 * persisting/retrieving them. Does NOT own: profile construction (ProfileService),
 * session lifecycle (SessionService), or any prompt-facing projection (PromptProjectionService).
 */
export class AccountService {
	/** Normalize a raw intake/signup payload into the shape `createAccount` expects. */
	public normalizeIntakePayload(rawPayload: Record<string, unknown>): {
		email: string;
		studentId: string;
		consent: Consent;
	} {
		//check for duplicate emails
		// hash email
		// search the db using the hashedEmail as the Key
		// if(db[key] returns a value other than null):
		//      return Error User already exists with that email
		//hash studentId
		//if(db[studentId] returns a vule other than null):
		//    a student by this id already exists
		//
		//if DUPLICATE EMAIL EXISTS THROW ERROR ALREADY AN ACCOUNT FOR THIS EMAIL
		//
		//CONTINUE OTHERWISE
		//DO THE SAME THING FOR DUPLICATE STUDENT Does
		//utilize the same hash and find method for the student ID's
		//---VALIDATE CONSENT -----
		//
		// TODO: implement
		return {
			email: "",
			studentId: "",
			consent: undefined as unknown as Consent,
		};
	}

	/** Persist a new `Account` (and its embedded `Consent`) for a freshly-registered student. */
	public async createAccount(data: {
		email: string;
		studentId: string;
		consent: Consent;
	}): Promise<Account> {
		// TODO: implement
		return undefined as unknown as Account;
	}

	/** Look up an `Account` by student id. */
	public async getAccount(studentId: string): Promise<Account | null> {
		// TODO: implement
		return null;
	}

	/** Verify the stored consent record satisfies current legal/policy version requirements. */
	public validateConsent(consent: Consent): boolean {
		// TODO: implement
		return false;
	}
}
