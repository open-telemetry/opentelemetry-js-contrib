#pragma once

// windows.h defines min and max macros.
#define NOMINMAX
#include <algorithm>
#undef min
#undef max
#undef NOMINMAX

#include <memory>

#include <stdint.h>
#include <tdigest/TDigest.h>

namespace opentelemetry {
  class Histogram {
    public:
      Histogram();

      uint64_t min();
      uint64_t max();
      uint64_t sum();
      uint64_t avg();
      uint64_t count();
      uint64_t percentile(double percentile);

      void reset();
      void add(uint64_t value);
    private:
      uint64_t min_;
      uint64_t max_;
      uint64_t sum_;
      uint64_t count_;
      std::shared_ptr<tdigest::TDigest> digest_;
  };
}
