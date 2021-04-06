import * as restify from 'restify';

export enum CustomAttributeNames {
  TYPE = 'restify.type',
  METHOD = 'restify.method',
  VERSION = 'restify.version',
}

export enum LayerType {
  MIDDLEWARE = 'middleware',
  REQUEST_HANDLER = 'request_handler',
}

declare interface RequestWithRoute extends restify.Request {
	route: { path: string },
	getRoute: (() => { path: string }),
}

export declare type Request = RequestWithRoute;
export declare type Metadata = {
	path?: string,
	methodName?: string,
	type: LayerType,
};
