import { InstrumentationBase } from "@opentelemetry/instrumentation";
import { RedisInstrumentationConfig } from "./types";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./version";
import { RedisInstrumentationV1_2_3 } from "./v1-2-3/instrumentation";

const DEFAULT_CONFIG: RedisInstrumentationConfig = {
    requireParentSpan: false,
};

// Wrapper RedisInstrumentation that address all supported versions
export class RedisInstrumentation extends InstrumentationBase<RedisInstrumentationConfig> {

    private instrumentationV1_2_3?: RedisInstrumentationV1_2_3;

    constructor(config: RedisInstrumentationConfig = {}) {
        super(PACKAGE_NAME, PACKAGE_VERSION, { ...DEFAULT_CONFIG, ...config });
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
        this.instrumentationV1_2_3 = new RedisInstrumentationV1_2_3(this.getConfig());
        const v1_2_3_patches = this.instrumentationV1_2_3.init();
        
        return [
            ...v1_2_3_patches,
        ];
    }
}