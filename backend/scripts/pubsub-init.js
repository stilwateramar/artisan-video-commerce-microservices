// Creates the video-events topic and the push subscription to catalog-service on the Pub/Sub
// emulator (local development). Production uses infra/deploy-microservices.sh instead.
// Usage: PUBSUB_EMULATOR_HOST=localhost:8681 node scripts/pubsub-init.js [pushEndpoint]
import { PubSub } from '@google-cloud/pubsub';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'demo-artisan';
const topicName = process.env.EVENTS_TOPIC || 'video-events';
const pushEndpoint = process.argv[2] || 'http://localhost:8082/events/video';
if (!process.env.PUBSUB_EMULATOR_HOST)
  throw new Error('PUBSUB_EMULATOR_HOST is not set; this script is for the emulator');

const pubsub = new PubSub({ projectId });
const [topic] = await pubsub.topic(topicName).get({ autoCreate: true });
const subscription = topic.subscription(`${topicName}-to-catalog`);
const [exists] = await subscription.exists();
if (exists) await subscription.delete();
await topic.createSubscription(`${topicName}-to-catalog`, {
  pushConfig: { pushEndpoint },
  ackDeadlineSeconds: 60,
});
console.log(`topic ${topicName} -> push ${pushEndpoint}`);
