import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';

export const db = new Firestore({ ignoreUndefinedProperties: true });
export const storage = new Storage();
