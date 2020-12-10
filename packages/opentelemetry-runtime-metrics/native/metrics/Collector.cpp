#include "Collector.hpp"

namespace opentelemetry {
  uint64_t Collector::time_to_micro(uv_timeval_t timeval) {
    return timeval.tv_sec * 1000 * 1000 + timeval.tv_usec;
  }
}
