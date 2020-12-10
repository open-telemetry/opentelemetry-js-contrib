#include <uv.h>

#include "Object.hpp"

namespace opentelemetry {
  Object::Object() {
    target_ = Nan::New<v8::Object>();
  }

  Object::Object(v8::Local<v8::Object> target) {
    target_ = target;
  }

  void Object::set(std::string key, std::string value) {
    Nan::Set(
      target_,
      Nan::New(key).ToLocalChecked(),
      Nan::New(value).ToLocalChecked()
    );
  }

  void Object::set(std::string key, uint64_t value) {
    Nan::Set(
      target_,
      Nan::New(key).ToLocalChecked(),
      Nan::New<v8::Number>(static_cast<double>(value))
    );
  }

  void Object::set(std::string key, v8::Local<v8::Object> value) {
    Nan::Set(
      target_,
      Nan::New(key).ToLocalChecked(),
      value
    );
  }

  void Object::set(std::string key, Object value) {
    Nan::Set(
      target_,
      Nan::New(key).ToLocalChecked(),
      value.to_json()
    );
  }

  void Object::set(std::string key, std::vector<Object> value) {
    v8::Local<v8::Array> array = Nan::New<v8::Array>(value.size());

    for (unsigned int i = 0; i < array->Length(); i++) {
      Nan::Set(array, i, value.at(i).to_json());
    }

    Nan::Set(
      target_,
      Nan::New(key).ToLocalChecked(),
      array
    );
  }

  void Object::set(std::string key, Histogram value) {
    Object obj;

    obj.set("min", value.min());
    obj.set("max", value.max());
    obj.set("sum", value.sum());
    obj.set("avg", value.avg());
    obj.set("count", value.count());
    obj.set("median", value.percentile(0.50));
    obj.set("p95", value.percentile(0.95));

    Nan::Set(
      target_,
      Nan::New(key).ToLocalChecked(),
      obj.to_json()
    );
  }

  void Object::set(std::string key, Nan::FunctionCallback value) {
    Nan::Set(
      target_,
      Nan::New(key).ToLocalChecked(),
      Nan::GetFunction(Nan::New<v8::FunctionTemplate>(value)).ToLocalChecked()
    );
  }

  v8::Local<v8::Object> Object::to_json() {
    return target_;
  }
}
