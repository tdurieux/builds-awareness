const Travis = require('travis-ci');

const travis = new Travis({
    version: '2.0.0'
});

module.exports = function(agenda, restartedDB, buildsaverDB) {
    const buildsCollection = restartedDB.collection('builds')

    async function getBuildsFromIds(buildIds) {
        return new Promise((resolve, reject) => {
            travis.builds('?ids[]=' + buildIds.join('&ids[]=') + "&random=" + Math.random()).get((err, data) => {
                if (err) {
                    return reject(err);
                }
                let items = data.builds;
                const commits = data.commits;
    
                for(let i in items) {
                    if (items[i].started_at) {
                        items[i].started_at = new Date(items[i].started_at)
                    }
                    if (items[i].finished_at) {
                        items[i].finished_at = new Date(items[i].finished_at)
                    }
                    items[i].commit = commits[i];
                }
                return resolve(items);
            });
        });
    };

    async function getNewBuild(builds) {
        const restartedBuilds = []
        const buildObj = {};
        for (let build of builds) {
            buildObj[build.id] = build
        }
        const newBuilds = await getBuildsFromIds(Object.keys(buildObj));
        for (let build of newBuilds) {
            delete build.commit;
            
            if (buildObj[build.id].started_at < build.started_at && build.state != 'started') {
                restartedBuilds.push({
                    id: build.id,
                    wait_time: build.started_at - buildObj[build.id].started_at,
                    old: buildObj[build.id],
                    new: build
                });
            }
        }
        return restartedBuilds;
    }

    agenda.define('fetch restarted builds', {concurrency: 1}, async job => {
        const maxRequest = 250

        let currentRequest = []
        const cursor = buildsaverDB.collection('builds').find({$and: [{started_at: {$gt: new Date(new Date().setDate(new Date().getDate()-3))}}, {$or: [{state: 'errored'}, {state: 'failed'}]}]}).sort( { _id: -1 } );
        const nbBuild = await cursor.count()
        let count = 0
        while ((build = await cursor.next())) {
            currentRequest.push(build)
            if (currentRequest.length >= maxRequest) {
                const newBuilds = await getNewBuild(currentRequest);
                await job.touch();
                if (newBuilds.length > 0) {
                    try {
                        await buildsCollection.insertMany(newBuilds)
                        await job.touch();
                    } catch (error) {
                        // ignore
                    }
                    job.attrs.data = {index: count, total: nbBuild}
                    await job.save();
                }
                currentRequest = []
            }
            count++;
        }
        if (currentRequest.length > 0) {
            const newBuilds = await getNewBuild(currentRequest);
            if (newBuilds.length > 0) {
                try {
                    await buildsCollection.insertMany(newBuilds)
                    await job.touch();
                } catch (error) {
                    // ignore
                }
            }
        }
        job.attrs.data = {index: count, total: nbBuild}
        await job.save();
    });
};