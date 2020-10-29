#pragma once

#include <map>
#include <string>
#include <stdint.h>
#include <v8.h>

#include "Collector.hpp"
#include "Histogram.hpp"
#include "Object.hpp"

namespace opentelemetry {
  class GarbageCollection : public Collector {
    public:
      GarbageCollection();

      void before(v8::GCType type);
      void after(v8::GCType type);
      void inject(Object carrier);
    private:
      std::map<v8::GCType, Histogram> pause_;
      std::map<unsigned char, std::string> types_;
      uint64_t start_time_;
  };
}
