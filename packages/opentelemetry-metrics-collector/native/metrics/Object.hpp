#pragma once

#include <nan.h>
#include <stdint.h>
#include <string>
#include <vector>

#include "Histogram.hpp"

namespace opentelemetry {
  class Object {
    public:
      Object();
      Object(v8::Local<v8::Object> target);

      void set(std::string key, std::string value);
      void set(std::string key, uint64_t value);
      void set(std::string key, v8::Local<v8::Object> value);
      void set(std::string key, Object value);
      void set(std::string key, std::vector<Object> value);
      void set(std::string key, Histogram value);
      void set(std::string key, Nan::FunctionCallback value);

      v8::Local<v8::Object> to_json();
    private:
      v8::Local<v8::Object> target_;
  };
}
