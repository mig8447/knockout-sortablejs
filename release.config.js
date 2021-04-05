module.exports = {
    plugins: [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        '@semantic-release/changelog',
        '@semantic-release/npm',
        [ '@semantic-release/git', {
            assets: [
                'CHANGELOG.md',
                'package.json',
                'package-lock.json',
                'npm-shrinkwrap.json'
            ]
        } ],
        [ '@semantic-release/github', {
            assets: []
        } ]
    ],
    preset: 'conventionalcommits',
    // Allow running locally
    ci: false
};
