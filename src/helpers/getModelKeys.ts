import { Prisma } from "@prisma/client";

export default async function getModelKeys(modelName: string): Promise<string[]> {
  const model = Prisma.dmmf.datamodel.models.find(
    (item) => item.name.toLowerCase() === modelName.toLowerCase()
  );

  if (!model) {
    console.warn(`Model '${modelName}' not found in Prisma schema.`);
    return [];
  }

  return model.fields
    .filter((field) => field.kind === "scalar")
    .map((field) => field.name);
}
