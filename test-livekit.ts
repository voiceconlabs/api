import { RoomServiceClient } from 'livekit-server-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

async function testLiveKit() {
  console.log('🔧 Testing LiveKit Connection...\n');
  console.log(`URL: ${LIVEKIT_URL}`);
  console.log(`API Key: ${LIVEKIT_API_KEY}\n`);

  const client = new RoomServiceClient(
    LIVEKIT_URL,
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET
  );

  try {
    console.log('📋 Listing existing rooms...');
    const rooms = await client.listRooms();
    console.log(`✅ Found ${rooms.length} room(s):`);

    rooms.forEach((room, index) => {
      console.log(`   ${index + 1}. ${room.name} (${room.numParticipants} participants)`);
    });

    console.log('\n🏗️  Creating test room...');
    const testRoom = await client.createRoom({
      name: `test-room-${Date.now()}`,
      emptyTimeout: 60,
    });
    console.log(`✅ Room created: ${testRoom.name}`);

    console.log('\n🗑️  Deleting test room...');
    await client.deleteRoom(testRoom.name);
    console.log(`✅ Room deleted: ${testRoom.name}`);

    console.log('\n🎉 LiveKit connection test successful!');
  } catch (error: any) {
    console.error('\n❌ LiveKit connection test failed:');
    console.error(error.message);
    process.exit(1);
  }
}

testLiveKit();
