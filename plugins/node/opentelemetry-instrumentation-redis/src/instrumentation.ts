import { InstrumentationBase } from "@opentelemetry/instrumentation";
import { RedisInstrumentationConfig } from "./types";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./version";
import { RedisInstrumentationV1_2_3 } from "./v1-2-3/instrumentation";
import { TracerProvider } from "@opentelemetry/api";

const DEFAULT_CONFIG: RedisInstrumentationConfig = {
    requireParentSpan: false,
};

// Wrapper RedisInstrumentation that address all supported versions
export class RedisInstrumentation extends InstrumentationBase<RedisInstrumentationConfig> {

    private instrumentationV1_2_3: RedisInstrumentationV1_2_3;

    // this is used to bypass a flaw in the base class constructor, which is calling 
    // member functions before the constructor has a chance to fully initialize the member variables.
    private initialized = false;

    constructor(config: RedisInstrumentationConfig = {}) {
        const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
        super(PACKAGE_NAME, PACKAGE_VERSION, resolvedConfig);

        this.instrumentationV1_2_3 = new RedisInstrumentationV1_2_3(this.getConfig());
        this.initialized = true;
    }

    override setConfig(config: RedisInstrumentationConfig = {}) {
        const newConfig = { ...DEFAULT_CONFIG, ...config };
        super.setConfig(newConfig);

        // set the configs on all specific version instrumentations
        // this function is also called in constructor, before the specific version instrumentations are initialized
        // which we need to avoid.
        this.instrumentationV1_2_3?.setConfig(newConfig);
    }

    override init() {
    }

    override setTracerProvider(tracerProvider: TracerProvider) {
        super.setTracerProvider(tracerProvider);
        if (!this.initialized) {
            return
        }
        this.instrumentationV1_2_3?.setTracerProvider(tracerProvider);
    }

    override enable() {
        super.enable();
        if (!this.initialized) {
            return
        }
        this.instrumentationV1_2_3?.enable();
    }

    override disable() {
        super.disable();
        if (!this.initialized) {
            return
        }
        this.instrumentationV1_2_3?.disable();
    }
}