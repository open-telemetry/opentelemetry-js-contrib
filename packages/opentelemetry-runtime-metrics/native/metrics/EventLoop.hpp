#pragma once

#include <stdint.h>
#include <uv.h>

#include "Collector.hpp"
#include "Histogram.hpp"

namespace opentelemetry {
  class EventLoop : public Collector {
    public:
      EventLoop();
      ~EventLoop();
      EventLoop(const EventLoop&) = delete;
      void operator=(const EventLoop&) = delete;

      void enable();
      void disable();
      void inject(Object carrier);
    protected:
      static void check_cb (uv_check_t* handle);
      static void prepare_cb (uv_prepare_t* handle);
    private:
      uv_check_t check_handle_;
      uv_prepare_t prepare_handle_;
      uint64_t check_time_;
      uint64_t prepare_time_;
      uint64_t timeout_;
      Histogram histogram_;

      uint64_t usage();
  };
}
