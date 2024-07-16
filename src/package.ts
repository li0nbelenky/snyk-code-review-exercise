import { RequestHandler } from 'express';
import { maxSatisfying } from 'semver';
import got from 'got';
import { NPMPackage } from './types';
import pLimit = require('p-limit') ;

const limit = pLimit(100);

type Package = { name?: string, version: string; dependencies: Record<string, Package> };

/**
 * Attempts to retrieve package data from the npm registry and return it
 */
const npmUrl = (name: string) => {
  return `https://registry.npmjs.org/${name}`;
}

export const getPackage: RequestHandler = async function (req, res, next) {
  const { name, version } = req.params;
  const dependencyTree = {};
  
  try {
    const npmPackage: NPMPackage = await got(
      npmUrl(name),
    ).json();

    const dependencies: Record<string, string> =
      npmPackage.versions[version].dependencies ?? {};
    const tasks :any = [];
    for (const [name, range] of Object.entries(dependencies)) {
      tasks.push(await limit(async ()=>{
        const response = await getDependencies(name, range);
        response.name = name;
        return response;
      }));
      // const subDep = await getDependencies(name, range);
      // dependencyTree[name] = subDep;
    }

    const promisifedDeps = await Promise.all(tasks);
    for (const depRecord of promisifedDeps){
      dependencyTree[depRecord.name as string] = depRecord;
    };

    return res
      .status(200)
      .json({ name, version, dependencies: dependencyTree });
  } catch (error) {
    return next(error);
  }
};

async function getDependencies(name: string, range: string): Promise<Package> {
  const npmPackage: NPMPackage = await got(
    npmUrl(name),
  ).json();

  const v = maxSatisfying(Object.keys(npmPackage.versions), range);
  const dependencies: Record<string, Package> = {};

  if (v) {
    const newDeps = npmPackage.versions[v].dependencies;
    for (const [name, range] of Object.entries(newDeps ?? {})) {
      dependencies[name] = await getDependencies(name, range);
    }
  }

  return { version: v ?? range, dependencies };
}
