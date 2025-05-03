import { PrismaClient } from '../generated/prisma'; // Adjust path if needed
const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding ...`);

  // Define the placeholder user ID used in your API
  const placeholderUserId = "user_placeholder_db_id";
  const existingUser = await prisma.user.findUnique({
    where: { id: placeholderUserId },
  });

  // Create the placeholder user only if it doesn't already exist
  if (!existingUser) {
    await prisma.user.create({
      data: {
        id: placeholderUserId,
        clerkId: "placeholder_clerk_id_" + Date.now(), // Make clerkId unique for seeding
        email: "placeholder_" + Date.now() + "@example.com", // Make email unique for seeding
        credits: 5, // Or any default value
      },
    });
    console.log(`Created user with ID: ${placeholderUserId}`);
  } else {
     console.log(`User with ID ${placeholderUserId} already exists.`);
  }

  console.log(`Seeding finished.`);
}

main()
  .catch(async (e) => {
    console.error("Error during seeding:", e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
