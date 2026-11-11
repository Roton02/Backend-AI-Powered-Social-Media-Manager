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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chargeClientToTechnician = exports.getOrCreateClientStripeCustomer = void 0;
const stripe_1 = __importDefault(require("./stripe"));
const prisma_1 = __importDefault(require("../shared/prisma"));
const ApiErrors_1 = __importDefault(require("../errors/ApiErrors"));
const getOrCreateClientStripeCustomer = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const user = yield prisma_1.default.user.findUnique({ where: { id: userId } });
    if (!user) {
        throw new ApiErrors_1.default(404, "User not found");
    }
    if (user.stripeCustomerId) {
        return { customerId: user.stripeCustomerId, user };
    }
    const customer = yield stripe_1.default.customers.create({
        name: user.userName,
        email: (_a = user.email) !== null && _a !== void 0 ? _a : undefined,
        phone: user.phone,
    });
    yield prisma_1.default.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customer.id },
    });
    return { customerId: customer.id, user };
});
exports.getOrCreateClientStripeCustomer = getOrCreateClientStripeCustomer;
const chargeClientToTechnician = (params) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!params.amount || params.amount <= 0) {
        throw new ApiErrors_1.default(400, "A positive amount is required for payment");
    }
    const { customerId } = yield (0, exports.getOrCreateClientStripeCustomer)(params.clientId);
    const appCharge = Math.round(params.amount * 0.05 * 100);
    if (params.paymentMethodId) {
        yield stripe_1.default.paymentMethods.attach(params.paymentMethodId, {
            customer: customerId,
        });
        yield stripe_1.default.customers.update(customerId, {
            invoice_settings: {
                default_payment_method: params.paymentMethodId,
            },
        });
    }
    const paymentIntent = yield stripe_1.default.paymentIntents.create(Object.assign(Object.assign({ amount: Math.round(params.amount * 100), currency: "bdt", payment_method: (_a = params.paymentMethodId) !== null && _a !== void 0 ? _a : undefined, customer: customerId, application_fee_amount: appCharge }, (params.technicianStripeAccountId
        ? {
            transfer_data: {
                destination: params.technicianStripeAccountId,
            },
        }
        : {})), { confirm: true, automatic_payment_methods: {
            enabled: true,
            allow_redirects: "never",
        } }));
    if (paymentIntent.status !== "succeeded") {
        throw new ApiErrors_1.default(400, "Payment failed");
    }
    return paymentIntent;
});
exports.chargeClientToTechnician = chargeClientToTechnician;
