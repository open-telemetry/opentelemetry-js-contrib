#include "Histogram.hpp"

namespace opentelemetry {
  Histogram::Histogram() {
    reset();
  }

  uint64_t Histogram::min() { return min_; }
  uint64_t Histogram::max() { return max_; }
  uint64_t Histogram::sum() { return sum_; }
  uint64_t Histogram::avg() { return count_ == 0 ? 0 : sum_ / count_; }
  uint64_t Histogram::count() { return count_; }
  uint64_t Histogram::percentile(double value) {
    return count_ == 0 ? 0 : static_cast<uint64_t>(std::round(digest_->quantile(value)));
  }

  void Histogram::reset() {
    min_ = 0;
    max_ = 0;
    sum_ = 0;
    count_ = 0;

    digest_ = std::make_shared<tdigest::TDigest>(1000);
  }

  void Histogram::add(uint64_t value) {
    if (count_ == 0) {
      min_ = max_ = value;
    } else {
      min_ = (std::min)(min_, value);
      max_ = (std::max)(max_, value);
    }

    count_ += 1;
    sum_ += value;

    digest_->add(static_cast<tdigest::Value>(value));
  }
}
