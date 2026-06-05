interface user {
	id: number;
	email: string;
	password_hash: string;
	created_at: Date;
	updated_at: Date;
}
/**
 *param: user_id
 */
interface student {
	id: number;
	user_id: number; //connects the foreign key from the user interface
	lp_exists: boolean;
	sessionCount: number;
	created_at: Date;
	updated_at: Date;
}
interface LearningProfile {
	id: number;
	student_id: number;
	cognitive: JSON; // update later when the schema has been created for the cognitive JSONB
	behavioral: historical;
	tone_notes;
	last_delta_at;
	created_at;
	updated_at;
}
