"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = getModelKeys;
const client_1 = require("@prisma/client");
function getModelKeys(modelName) {
    return __awaiter(this, void 0, void 0, function* () {
        const model = client_1.Prisma.dmmf.datamodel.models.find((item) => item.name.toLowerCase() === modelName.toLowerCase());
        if (!model) {
            console.warn(`Model '${modelName}' not found in Prisma schema.`);
            return [];
        }
        return model.fields
            .filter((field) => field.kind === "scalar")
            .map((field) => field.name);
    });
}
