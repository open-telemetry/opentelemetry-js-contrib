#pragma once

#include "Collector.hpp"
#include "Object.hpp"

namespace opentelemetry {
  class Heap : public Collector {
    public:
      void inject(Object carrier);
  };
}
