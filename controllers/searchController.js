const Artist = require('../models/Artist');
const Song = require('../models/Song');
const Album = require('../models/Album');
const searchService = require('../services/searchService');

// Global search across Artists, Songs, and Albums
const globalSearch = async (req, res) => {
    const { q, page = 1, limit = 10 } = req.query;

    if (!q) {
        return res.status(400).json({ message: 'Search query is required' });
    }

    try {
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        if (pageNum < 1 || limitNum < 1) {
            return res.status(400).json({ message: 'Page and limit must be positive numbers' });
        }

        const skip = (pageNum - 1) * limitNum;

        // Tìm kiếm Artists
        const artistQuery = {
            name: { $regex: q, $options: 'i' },
        };
        const artists = await Artist.find(artistQuery)
            .skip(skip)
            .limit(limitNum)
            .lean();
        const totalArtists = await Artist.countDocuments(artistQuery);

        // Tìm kiếm Songs
        const songPipeline = [
            {
                $lookup: {
                    from: 'artists',
                    localField: 'artists',
                    foreignField: '_id',
                    as: 'artist',
                },
            },
            {
                $lookup: {
                    from: 'albums',
                    localField: 'album',
                    foreignField: '_id',
                    as: 'album',
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'uploadedBy',
                    foreignField: '_id',
                    as: 'uploadedBy',
                },
            },
            { $unwind: { path: '$artist', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$album', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$uploadedBy', preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    $and: [
                        { status: 'public' },
                        {
                            $or: [
                                { title: { $regex: q, $options: 'i' } },
                                { 'artist.name': { $regex: q, $options: 'i' } },
                                { 'album.title': { $regex: q, $options: 'i' } },
                                { tags: { $regex: q, $options: 'i' } },
                                { lyrics: { $regex: q, $options: 'i' } },
                            ],
                        },
                    ],
                },
            },
            {
                $project: {
                    title: 1,
                    url: 1,
                    thumbnail: 1,
                    duration: 1,
                    'artist.name': 1,
                    'album.title': 1,
                    'uploadedBy.username': 1,
                    createdAt: 1,
                    updatedAt: 1,
                    genres: 1,
                    playCount: 1,
                    likes: 1,
                    releaseYear: 1,
                    tags: 1,
                    language: 1,
                    lyrics: 1,
                },
            },
            { $skip: skip },
            { $limit: limitNum },
        ];

        const songs = await Song.aggregate(songPipeline).exec();

        const songCountPipeline = [
            {
                $lookup: {
                    from: 'artists',
                    localField: 'artists',
                    foreignField: '_id',
                    as: 'artist',
                },
            },
            {
                $lookup: {
                    from: 'albums',
                    localField: 'album',
                    foreignField: '_id',
                    as: 'album',
                },
            },
            { $unwind: { path: '$artist', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$album', preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    $and: [
                        { status: 'public' },
                        {
                            $or: [
                                { title: { $regex: q, $options: 'i' } },
                                { 'artist.name': { $regex: q, $options: 'i' } },
                                { 'album.title': { $regex: q, $options: 'i' } },
                                { tags: { $regex: q, $options: 'i' } },
                                { lyrics: { $regex: q, $options: 'i' } },
                            ],
                        },
                    ],
                },
            },
            { $count: 'total' },
        ];

        const songCountResult = await Song.aggregate(songCountPipeline).exec();
        const totalSongs = songCountResult[0]?.total || 0;

        // Tìm kiếm Albums
        const albumPipeline = [
            {
                $lookup: {
                    from: 'artists',
                    localField: 'artist',
                    foreignField: '_id',
                    as: 'artist',
                },
            },
            { $unwind: { path: '$artist', preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    $or: [
                        { title: { $regex: q, $options: 'i' } },
                        { 'artist.name': { $regex: q, $options: 'i' } },
                    ],
                },
            },
            {
                $project: {
                    title: 1,
                    cover: 1,
                    releaseDate: 1,
                    'artist.name': 1,
                },
            },
            { $skip: skip },
            { $limit: limitNum },
        ];

        const albums = await Album.aggregate(albumPipeline).exec();

        const albumCountPipeline = [
            {
                $lookup: {
                    from: 'artists',
                    localField: 'artist',
                    foreignField: '_id',
                    as: 'artist',
                },
            },
            { $unwind: { path: '$artist', preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    $or: [
                        { title: { $regex: q, $options: 'i' } },
                        { 'artist.name': { $regex: q, $options: 'i' } },
                    ],
                },
            },
            { $count: 'total' },
        ];

        const albumCountResult = await Album.aggregate(albumCountPipeline).exec();
        const totalAlbums = albumCountResult[0]?.total || 0;

        // Trả về kết quả tìm kiếm
        res.json({
            artists: {
                results: artists,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(totalArtists / limitNum),
                    totalResults: totalArtists,
                    limit: limitNum,
                },
            },
            songs: {
                results: songs,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(totalSongs / limitNum),
                    totalResults: totalSongs,
                    limit: limitNum,
                },
            },
            albums: {
                results: albums,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(totalAlbums / limitNum),
                    totalResults: totalAlbums,
                    limit: limitNum,
                },
            },
        });
    } catch (error) {
        console.error('Error in globalSearch:', error);
        res.status(500).json({ message: error.message });
    }
};

// Global search without pagination - returns all matching results
const globalSearchAll = async (req, res) => {
    const { q } = req.query;

    if (!q) {
        return res.status(400).json({ message: 'Search query is required' });
    }

    try {
        // Tìm kiếm Artists
        const artistQuery = {
            name: { $regex: q, $options: 'i' },
        };
        const artists = await Artist.find(artistQuery).lean();

        // Tìm kiếm Songs
        const songPipeline = [
            {
                $lookup: {
                    from: 'artists',
                    localField: 'artists',
                    foreignField: '_id',
                    as: 'artist',
                },
            },
            {
                $lookup: {
                    from: 'albums',
                    localField: 'album',
                    foreignField: '_id',
                    as: 'album',
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'uploadedBy',
                    foreignField: '_id',
                    as: 'uploadedBy',
                },
            },
            { $unwind: { path: '$artist', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$album', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$uploadedBy', preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    $and: [
                        { status: 'public' },
                        {
                            $or: [
                                { title: { $regex: q, $options: 'i' } },
                                { 'artist.name': { $regex: q, $options: 'i' } },
                                { 'album.title': { $regex: q, $options: 'i' } },
                                { tags: { $regex: q, $options: 'i' } },
                                { lyrics: { $regex: q, $options: 'i' } },
                            ],
                        },
                    ],
                },
            },
            {
                $project: {
                    title: 1,
                    url: 1,
                    thumbnail: 1,
                    duration: 1,
                    'artist.name': 1,
                    'album.title': 1,
                    'uploadedBy.username': 1,
                    createdAt: 1,
                    updatedAt: 1,
                    genres: 1,
                    playCount: 1,
                    likes: 1,
                    releaseYear: 1,
                    tags: 1,
                    language: 1,
                    lyrics: 1,
                },
            },
        ];

        const songs = await Song.aggregate(songPipeline).exec();

        // Tìm kiếm Albums
        const albumPipeline = [
            {
                $lookup: {
                    from: 'artists',
                    localField: 'artist',
                    foreignField: '_id',
                    as: 'artist',
                },
            },
            { $unwind: { path: '$artist', preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    $or: [
                        { title: { $regex: q, $options: 'i' } },
                        { 'artist.name': { $regex: q, $options: 'i' } },
                    ],
                },
            },
            {
                $project: {
                    title: 1,
                    cover: 1,
                    releaseDate: 1,
                    'artist.name': 1,
                },
            },
        ];

        const albums = await Album.aggregate(albumPipeline).exec();

        // Trả về tất cả kết quả không phân trang
        res.json({
            artists,
            songs,
            albums,
            total: {
                artists: artists.length,
                songs: songs.length,
                albums: albums.length
            }
        });
    } catch (error) {
        console.error('Error in globalSearchAll:', error);
        res.status(500).json({ message: error.message });
    }
};

// Tìm kiếm theo tên bài hát
const searchByTitle = async (req, res) => {
    try {
        const { q, limit } = req.query;
        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }

        const songs = await searchService.searchByTitle(q, parseInt(limit) || 10);
        res.json({
            success: true,
            data: songs,
            total: songs.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Tìm kiếm theo tên nghệ sĩ
const searchByArtist = async (req, res) => {
    try {
        const { q, limit } = req.query;
        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }

        const artists = await searchService.searchByArtist(q, parseInt(limit) || 10);
        res.json({
            success: true,
            data: artists,
            total: artists.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Tìm kiếm trong lyrics
const searchByLyrics = async (req, res) => {
    try {
        const { q, limit } = req.query;
        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }

        const songs = await searchService.searchByLyrics(q, parseInt(limit) || 10);
        res.json({
            success: true,
            data: songs,
            total: songs.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Tìm kiếm theo genre
const searchByGenre = async (req, res) => {
    try {
        const { genre, limit } = req.query;
        if (!genre) {
            return res.status(400).json({
                success: false,
                error: 'Genre is required'
            });
        }

        const songs = await searchService.searchByGenre(genre, parseInt(limit) || 10);
        res.json({
            success: true,
            data: songs,
            total: songs.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

module.exports = {
    globalSearch,
    globalSearchAll,
    searchByTitle,
    searchByArtist,
    searchByLyrics,
    searchByGenre
};