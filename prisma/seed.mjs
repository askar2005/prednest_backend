import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const p = new PrismaClient();

async function main() {
  console.log('Seeding database...\n');

  const password = await bcrypt.hash('Test@123', 12);

  // 1. Create admin
  const admin = await p.admin.upsert({
    where: { email: 'admin@prepnest.com' },
    update: {},
    create: {
      fullName: 'Admin PrepNest',
      email: 'admin@prepnest.com',
      passwordHash: password,
      role: 'ADMIN',
      isVerified: true,
    },
  });
  console.log(`Admin: ${admin.email} (password: Test@123)`);

  // 2. Create user
  const user = await p.user.upsert({
    where: { email: 'user@prepnest.com' },
    update: {},
    create: {
      name: 'Test User',
      email: 'user@prepnest.com',
      passwordHash: password,
      role: 'USER',
      isVerified: true,
    },
  });
  console.log(`User: ${user.email} (password: Test@123)`);

  // 3. Create a UserStreak for the user
  await p.userStreak.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      currentStreak: 0,
      longestStreak: 0,
    },
  });
  console.log('UserStreak created');

  // 4. Create Daily Challenges
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  await p.dailyChallenge.upsert({
    where: { id: 'seed-dc-archived' },
    update: {},
    create: {
      id: 'seed-dc-archived',
      question: 'What is the capital of France?',
      optionA: 'London',
      optionB: 'Paris',
      optionC: 'Berlin',
      optionD: 'Madrid',
      correctAnswer: 'B',
      explanation: 'Paris is the capital and largest city of France.',
      status: 'ARCHIVED',
      publishedAt: yesterday,
    },
  });
  console.log('DailyChallenge (ARCHIVED): Yesterday\'s question');

  await p.dailyChallenge.upsert({
    where: { id: 'seed-dc-active' },
    update: {},
    create: {
      id: 'seed-dc-active',
      question: 'Which planet is known as the Red Planet?',
      optionA: 'Venus',
      optionB: 'Jupiter',
      optionC: 'Mars',
      optionD: 'Saturn',
      correctAnswer: 'C',
      explanation: 'Mars appears reddish due to iron oxide (rust) on its surface.',
      status: 'ACTIVE',
      publishedAt: today,
    },
  });
  console.log('DailyChallenge (ACTIVE): Today\'s question');

  await p.dailyChallenge.upsert({
    where: { id: 'seed-dc-queue' },
    update: {},
    create: {
      id: 'seed-dc-queue',
      question: 'What is the chemical symbol for water?',
      optionA: 'H2O',
      optionB: 'CO2',
      optionC: 'NaCl',
      optionD: 'O2',
      correctAnswer: 'A',
      explanation: 'Water consists of two hydrogen atoms and one oxygen atom.',
      status: 'QUEUE',
      publishedAt: tomorrow,
    },
  });
  console.log('DailyChallenge (QUEUE): Tomorrow\'s question');

  const counts = {
    users: await p.user.count(),
    admins: await p.admin.count(),
    dailyChallenges: await p.dailyChallenge.count(),
    userStreaks: await p.userStreak.count(),
  };
  console.log('\nSeeding complete:', JSON.stringify(counts, null, 2));
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
