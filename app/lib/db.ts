// This file maintains backward compatibility
// All database operations have been moved to app/lib/db/ directory
// Import from here for compatibility, but new code should import from 'app/lib/db'

export * from './db/index';
