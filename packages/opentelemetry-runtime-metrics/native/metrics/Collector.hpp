#pragma once

#include <stdint.h>
#include <uv.h>

#include "Object.hpp"

namespace opentelemetry {
  class Collector {
    public:
      virtual void inject(Object carrier) = 0;
    protected:
      virtual uint64_t time_to_micro(uv_timeval_t timeval);
  };
}
