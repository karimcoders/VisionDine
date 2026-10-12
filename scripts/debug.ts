import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const ings = await db.ingredient.findMany();
  console.log("Ingredients in DB:", ings.map((i) => i.name));
}
main().finally(() => db.$disconnect());
