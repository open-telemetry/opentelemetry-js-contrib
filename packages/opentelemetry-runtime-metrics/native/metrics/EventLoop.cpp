#include "EventLoop.hpp"

namespace opentelemetry {
  // http://docs.libuv.org/en/v1.x/design.html#the-i-o-loop
  EventLoop::EventLoop() {
    uv_check_init(uv_default_loop(), &check_handle_);
    uv_prepare_init(uv_default_loop(), &prepare_handle_);
    uv_unref(reinterpret_cast<uv_handle_t*>(&check_handle_));
    uv_unref(reinterpret_cast<uv_handle_t*>(&prepare_handle_));

    check_handle_.data = (void*)this;
    prepare_handle_.data = (void*)this;

    check_time_ = uv_hrtime();
  }

  EventLoop::~EventLoop() {
    uv_check_stop(&check_handle_);
    uv_prepare_stop(&prepare_handle_);
  }

  void EventLoop::check_cb (uv_check_t* handle) {
    EventLoop* self = (EventLoop*)handle->data;

    uint64_t check_time = uv_hrtime();
    uint64_t poll_time = check_time - self->prepare_time_;
    uint64_t latency = self->prepare_time_ - self->check_time_;
    uint64_t timeout = self->timeout_ * 1000 * 1000;

    if (poll_time > timeout) {
      latency += poll_time - timeout;
    }

    self->histogram_.add(latency);
    self->check_time_ = check_time;
  }

  void EventLoop::prepare_cb (uv_prepare_t* handle) {
    EventLoop* self = (EventLoop*)handle->data;

    self->prepare_time_ = uv_hrtime();
    self->timeout_ = uv_backend_timeout(uv_default_loop());
  }

  void EventLoop::enable() {
    uv_check_start(&check_handle_, &EventLoop::check_cb);
    uv_prepare_start(&prepare_handle_, &EventLoop::prepare_cb);
  }

  void EventLoop::disable() {
    uv_check_stop(&check_handle_);
    uv_prepare_stop(&prepare_handle_);
    histogram_.reset();
  }

  void EventLoop::inject(Object carrier) {
    carrier.set("eventLoop", histogram_);
    histogram_.reset();
  }
}
