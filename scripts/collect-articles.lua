-- Store all articles metadata
local articles = {}
local categories = {}

-- Helper function to read metadata from a markdown file
function read_metadata(file_path)
    local file = io.open(file_path, "r")
    if not file then return nil end
    
    local metadata = {}
    local in_yaml = false
    
    for line in file:lines() do
        if line == "---" then
            if not in_yaml then
                in_yaml = true
            else
                break
            end
        elseif in_yaml then
            local key, value = line:match("^([%w-]+):%s*(.+)$")
            if key and value then
                -- Remove quotes if present
                value = value:gsub('^"(.*)"$', '%1')
                value = value:gsub("^'(.*)'$", '%1')
                metadata[key] = value
            end
        end
    end
    
    file:close()
    return metadata
end

-- Helper function to parse date
function parse_date(date_str)
    if not date_str then return nil end
    local year, month, day = date_str:match("(%d%d%d%d)-(%d%d)-(%d%d)")
    if not year then return nil end
    return {year = tonumber(year), month = tonumber(month), day = tonumber(day)}
end

-- Helper function to compare dates
function is_date_newer(date1, date2)
    if not date1 or not date2 then return false end
    if date1.year ~= date2.year then return date1.year > date2.year end
    if date1.month ~= date2.month then return date1.month > date2.month end
    return date1.day > date2.day
end

-- Helper function to check if date is within last 30 days
function is_recent(date_str)
    local date = parse_date(date_str)
    if not date then return false end
    
    -- Get current date from the system
    local current = os.date("*t")
    
    -- Calculate rough difference in days
    local diff_days = math.abs(
        (current.year - date.year) * 365 +
        (current.month - date.month) * 30 +
        (current.day - date.day)
    )
    
    return diff_days <= 30
end

-- Collect all articles when document is read
function Doc(doc)
    local articles_dir = "articles"
    local files = io.popen('dir /b "' .. articles_dir .. '\\*.md"'):lines()
    
    for file in files do
        if file ~= "empty.md" then
            local metadata = read_metadata(articles_dir .. "\\" .. file)
            if metadata then
                -- Extract metadata using your structure
                local article = {
                    title = metadata.title or "Untitled",
                    subtitle = metadata.subtitle,
                    date = metadata.modified or metadata.created,
                    category = metadata.category or "w/o category",
                    url = file:gsub("%.md$", ".html"),
                    status = metadata.status,
                    importance = tonumber(metadata.importance) or 0,
                    confidence = metadata.confidence,
                    thumbnail = metadata.thumbnail,
                    recent = is_recent(metadata.modified or metadata.created)
                }
                
                if article.status == "published" then
                    table.insert(articles, article)
                    
                    -- Add to categories
                    local cat = categories[article.category] or {
                        name = article.category,
                        articles = {},
                        importance = 0
                    }
                    
                    -- Update category importance
                    cat.importance = math.max(cat.importance, article.importance or 0)
                    
                    table.insert(cat.articles, {
                        title = article.title,
                        subtitle = article.subtitle,
                        url = article.url,
                        date = article.date,
                        importance = article.importance,
                        confidence = article.confidence,
                        thumbnail = article.thumbnail
                    })
                    
                    categories[article.category] = cat
                end
            end
        end
    end
    
    -- Sort articles by date and importance
    table.sort(articles, function(a, b)
        if a.importance ~= b.importance then
            return (a.importance or 0) > (b.importance or 0)
        end
        local date_a = parse_date(a.date)
        local date_b = parse_date(b.date)
        return is_date_newer(date_a, date_b)
    end)
    
    -- Sort articles within categories
    for _, cat in pairs(categories) do
        table.sort(cat.articles, function(a, b)
            if a.importance ~= b.importance then
                return (a.importance or 0) > (b.importance or 0)
            end
            local date_a = parse_date(a.date)
            local date_b = parse_date(b.date)
            return is_date_newer(date_a, date_b)
        end)
    end
    
    -- Convert categories to sorted list by importance then name
    local cat_list = {}
    for _, cat in pairs(categories) do
        table.insert(cat_list, cat)
    end
    table.sort(cat_list, function(a, b)
        if a.importance ~= b.importance then
            return a.importance > b.importance
        end
        return a.name < b.name
    end)
    
    -- Add metadata to document
    doc.meta.articles = pandoc.MetaList{}
    for _, article in ipairs(articles) do
        doc.meta.articles[#doc.meta.articles + 1] = pandoc.MetaMap{
            title = article.title,
            subtitle = article.subtitle,
            date = article.date,
            category = article.category,
            url = article.url,
            status = article.status,
            importance = article.importance,
            confidence = article.confidence,
            thumbnail = article.thumbnail,
            recent = article.recent
        }
    end
    
    doc.meta.categories = pandoc.MetaList{}
    for _, cat in ipairs(cat_list) do
        local articles_meta = pandoc.MetaList{}
        for _, article in ipairs(cat.articles) do
            articles_meta[#articles_meta + 1] = pandoc.MetaMap{
                title = article.title,
                subtitle = article.subtitle,
                url = article.url,
                date = article.date,
                importance = article.importance,
                confidence = article.confidence,
                thumbnail = article.thumbnail
            }
        end
        doc.meta.categories[#doc.meta.categories + 1] = pandoc.MetaMap{
            name = cat.name,
            importance = cat.importance,
            articles = articles_meta
        }
    end
    
    return doc
end
