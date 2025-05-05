import { Connection, Client } from '@temporalio/client';

// Define the connection options. Adjust address if your Temporal server is elsewhere.
const connectionOptions = {
  address: '127.0.0.1:7233', // Explicitly use IPv4 loopback
  // Specify TLS options if necessary, e.g., for Temporal Cloud:
  // tls: {}, 
};

let clientInstance: Client | null = null;

/**
 * Connects to Temporal and returns a singleton Client instance.
 * Creates the connection if it doesn't exist.
 */
export async function getTemporalClient(): Promise<Client> {
  if (!clientInstance) {
    try {
      const connection = await Connection.connect(connectionOptions);
      clientInstance = new Client({
        connection,
        // namespace: 'default', // Specify namespace if not using 'default'
      });
      console.log('Successfully connected to Temporal.');
    } catch (err) {
      console.error('Failed to connect to Temporal:', err);
      // Depending on your error handling strategy, you might want to:
      // - Throw the error to prevent the calling code from proceeding.
      // - Implement retry logic.
      // - Return null or a specific error indicator.
      throw new Error('Could not establish Temporal connection.');
    }
  }
  return clientInstance;
}

// Optional: Function to explicitly disconnect (useful for cleanup in tests or shutdown)
export async function disconnectTemporalClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.connection.close();
    clientInstance = null;
    console.log('Disconnected from Temporal.');
  }
} 