import { config } from 'dotenv';
import { join } from 'node:path';
import { MongoClient } from 'mongodb';

config({ path: join(__dirname, '../.env') });
async function main() {
  if (!process.env.MONGODB_URI)
    throw new Error(
      'Set MONGODB_URI for a read-only legacy inventory. This tool never writes MongoDB or PostgreSQL.',
    );
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await client.connect();
    const database = client.db();
    const inventory = [];
    for (const collection of await database
      .listCollections({}, { nameOnly: true })
      .toArray())
      inventory.push({
        collection: collection.name,
        count: await database.collection(collection.name).countDocuments(),
      });
    console.log(
      JSON.stringify(
        {
          mode: 'READ_ONLY_INVENTORY',
          collections: inventory,
          note: 'No names, emails, passwords, certificates or tokens are emitted. Freeze writes and back up Mongo before any separately reviewed migration.',
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
