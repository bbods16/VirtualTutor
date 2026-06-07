//todo Design the key. It must uniquely identify one student's active session. Format: session:{student_id}. Example: session:abc-123-def. This means if a student somehow opens two sessions (which your architecture prevents, but defensively), the second write overwrites the first — which is the correct behavior.

// Design the value. It must hold the full ConversationHistory so the server can recover it on reconnect. Serialize the ConversationHistory hashmap as a JSON string. Each entry is an index mapped to a pair of UserInput and LLMOutput text.

// Design the TTL. A session left idle for 4 hours should not persist in Redis indefinitely. Set TTL to 4 hours (14400 seconds). Reset the TTL on every message exchange so active sessions never expire mid-conversation.

// On session end: DeltaProcessor reads the Redis value, runs the differential merge, writes to PostgreSQL, then DEL the Redis key explicitly rather than waiting for TTL.
