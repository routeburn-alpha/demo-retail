import { config } from 'dotenv';

// Make DATABASE_URL (and friends) available to Node integration tests.
config({ path: '.env.local' });
config();
