/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * The human readable name of the pipeline within a CI/CD system.
 *
 * @example Build and Test
 * @example Lint
 * @example Deploy Go Project
 * @example deploy_to_environment
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_CICD_PIPELINE_NAME = 'cicd.pipeline.name' as const;

/**
 * The unique identifier of a pipeline run within a CI/CD system.
 *
 * @example 120912
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_CICD_PIPELINE_RUN_ID = 'cicd.pipeline.run.id' as const;

/**
 * The name of the [reference](https://git-scm.com/docs/gitglossary#def_ref) such as **branch** or **tag** in the repository.
 *
 * @example my-feature-branch
 * @example tag-1-test
 *
 * @note `base` refers to the starting point of a change. For example, `main`
 * would be the base reference of type branch if you've created a new
 * reference of type branch from it and created new commits.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_VCS_REF_BASE_NAME = 'vcs.ref.base.name' as const;

/**
 * The name of the [reference](https://git-scm.com/docs/gitglossary#def_ref) such as **branch** or **tag** in the repository.
 *
 * @example my-feature-branch
 * @example tag-1-test
 *
 * @note `head` refers to where you are right now; the current reference at a
 * given time.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_VCS_REF_HEAD_NAME = 'vcs.ref.head.name' as const;

/**
 * The revision, literally [revised version](https://www.merriam-webster.com/dictionary/revision), The revision most often refers to a commit object in Git, or a revision number in SVN.
 *
 * @example 9d59409acf479dfa0df1aa568182e43e43df8bbe28d60fcf2bc52e30068802cc
 * @example main
 * @example 123
 * @example HEAD
 *
 * @note `head` refers to where you are right now; the current reference at a
 * given time.The revision can be a full [hash value (see
 * glossary)](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-5.pdf),
 * of the recorded change to a ref within a repository pointing to a
 * commit [commit](https://git-scm.com/docs/git-commit) object. It does
 * not necessarily have to be a hash; it can simply define a [revision
 * number](https://svnbook.red-bean.com/en/1.7/svn.tour.revs.specifiers.html)
 * which is an integer that is monotonically increasing. In cases where
 * it is identical to the `ref.head.name`, it **SHOULD** still be included.
 * It is up to the implementer to decide which value to set as the
 * revision based on the VCS system and situational context.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_VCS_REF_HEAD_REVISION = 'vcs.ref.head.revision' as const;
